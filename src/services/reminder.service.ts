import type { Repository } from "typeorm";
import type {
  ActiveStatus,
  DestinationType,
  ReminderCategory,
  ScheduleType,
} from "../persistence/entities/reminder-definition.entity.js";
import { ReminderDefinition } from "../persistence/entities/reminder-definition.entity.js";
import { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";
import { generateOccurrenceCandidates } from "../scheduler/recurrence.js";
import { addDaysToDate, getTodayDateInZone } from "../shared/time.js";
import type { HistoryService } from "./history.service.js";

export interface CreateReminderInput {
  title: string;
  description?: string | null | undefined;
  category?: ReminderCategory | undefined;
  targetUserIds: number[];
  destinationChatId: number;
  destinationType?: DestinationType | undefined;
  scheduleType?: ScheduleType | undefined;
  timesOfDay: string[];
  daysOfWeek?: number[] | null | undefined;
  timezone?: string | undefined;
  startDate: string;
  endDate?: string | null | undefined;
  snoozeIntervals?: number[] | undefined;
  maxSnoozeCount?: number | undefined;
  autoRepeatIntervals?: number[] | undefined;
  maxAutoRepeatCount?: number | undefined;
}

export class ReminderService {
  constructor(
    private readonly defRepo: Repository<ReminderDefinition>,
    private readonly occRepo: Repository<ReminderOccurrence>,
    private readonly historyService: HistoryService,
  ) {}

  public async createReminder(
    input: CreateReminderInput,
    creatorUserId: number,
  ): Promise<ReminderDefinition> {
    const def = this.defRepo.create({
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? "measurement",
      createdByUserId: creatorUserId,
      targetUserIdsJson: JSON.stringify(input.targetUserIds),
      destinationChatId: input.destinationChatId,
      destinationType: input.destinationType ?? (input.destinationChatId < 0 ? "group" : "dm"),
      scheduleType: input.scheduleType ?? "daily",
      timesOfDayJson: JSON.stringify(input.timesOfDay),
      daysOfWeekJson: input.daysOfWeek ? JSON.stringify(input.daysOfWeek) : null,
      timezone: input.timezone ?? "Europe/Moscow",
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      snoozeIntervalsJson: JSON.stringify(input.snoozeIntervals ?? [5, 10, 20, 40, 60]),
      maxSnoozeCount: input.maxSnoozeCount ?? 5,
      autoRepeatIntervalsJson: JSON.stringify(input.autoRepeatIntervals ?? [5, 10, 20, 40]),
      maxAutoRepeatCount: input.maxAutoRepeatCount ?? 4,
      activeStatus: "active",
    });

    const savedDef = await this.defRepo.save(def);

    // Populate initial batch of occurrences
    await this.populateOccurrencesForDefinition(savedDef);

    return savedDef;
  }

  public async getReminder(id: number): Promise<ReminderDefinition | null> {
    return this.defRepo.findOneBy({ id });
  }

  public async listReminders(status?: ActiveStatus): Promise<ReminderDefinition[]> {
    if (status) {
      return this.defRepo.find({ where: { activeStatus: status }, order: { createdAt: "DESC" } });
    }
    return this.defRepo.find({ order: { createdAt: "DESC" } });
  }

  public async pauseReminder(id: number, actorUserId: number): Promise<boolean> {
    const def = await this.getReminder(id);
    if (!def) return false;

    def.activeStatus = "paused";
    await this.defRepo.save(def);

    // Cancel future scheduled occurrences
    await this.occRepo
      .createQueryBuilder()
      .update(ReminderOccurrence)
      .set({ status: "CANCELLED", cancelledAtUtc: new Date() })
      .where("reminderDefinitionId = :id AND status = 'SCHEDULED'", { id })
      .execute();

    await this.historyService.logEvent(`def-${id}`, id, 0, actorUserId, "paused", {
      title: def.title,
    });

    return true;
  }

  public async resumeReminder(id: number, actorUserId: number): Promise<boolean> {
    const def = await this.getReminder(id);
    if (!def) return false;

    def.activeStatus = "active";
    await this.defRepo.save(def);

    // Regenerate upcoming occurrences
    await this.populateOccurrencesForDefinition(def);

    await this.historyService.logEvent(`def-${id}`, id, 0, actorUserId, "resumed", {
      title: def.title,
    });

    return true;
  }

  public async deleteReminder(id: number, actorUserId: number): Promise<boolean> {
    const def = await this.getReminder(id);
    if (!def) return false;

    def.activeStatus = "archived";
    await this.defRepo.save(def);

    // Cancel future scheduled occurrences
    await this.occRepo
      .createQueryBuilder()
      .update(ReminderOccurrence)
      .set({ status: "CANCELLED", cancelledAtUtc: new Date() })
      .where("reminderDefinitionId = :id AND status = 'SCHEDULED'", { id })
      .execute();

    await this.historyService.logEvent(`def-${id}`, id, 0, actorUserId, "cancelled", {
      title: def.title,
    });

    return true;
  }

  public async updateReminder(
    id: number,
    patch: {
      title?: string;
      description?: string | null;
      timesOfDay?: string[];
      destinationChatId?: number;
      destinationType?: DestinationType;
      targetUserIds?: number[];
      activeStatus?: ActiveStatus;
    },
    actorUserId: number,
  ): Promise<ReminderDefinition | null> {
    const def = await this.getReminder(id);
    if (!def) return null;

    if (patch.title !== undefined) def.title = patch.title;
    if (patch.description !== undefined) def.description = patch.description;
    if (patch.timesOfDay !== undefined) {
      def.timesOfDayJson = JSON.stringify(patch.timesOfDay);
    }
    if (patch.destinationChatId !== undefined) def.destinationChatId = patch.destinationChatId;
    if (patch.destinationType !== undefined) def.destinationType = patch.destinationType;
    if (patch.targetUserIds !== undefined) {
      def.targetUserIdsJson = JSON.stringify(patch.targetUserIds);
    }
    if (patch.activeStatus !== undefined) def.activeStatus = patch.activeStatus;

    const saved = await this.defRepo.save(def);

    if (patch.timesOfDay !== undefined || patch.targetUserIds !== undefined) {
      await this.occRepo
        .createQueryBuilder()
        .delete()
        .from(ReminderOccurrence)
        .where("reminderDefinitionId = :id AND status = 'SCHEDULED'", { id })
        .execute();

      if (saved.activeStatus === "active") {
        await this.populateOccurrencesForDefinition(saved);
      }
    }

    await this.historyService.logEvent(`def-${id}`, id, 0, actorUserId, "resumed", {
      action: "updated",
      patch,
    });

    return saved;
  }

  public async populateOccurrencesForDefinition(
    def: ReminderDefinition,
    windowDays = 14,
  ): Promise<number> {
    if (def.activeStatus !== "active") return 0;

    const today = getTodayDateInZone(def.timezone);
    const windowStart = def.startDate > today ? def.startDate : today;
    const windowEnd = addDaysToDate(windowStart, windowDays);

    const candidates = generateOccurrenceCandidates(def, windowStart, windowEnd);
    let createdCount = 0;

    for (const occ of candidates) {
      const existing = await this.occRepo.findOne({
        where: {
          reminderDefinitionId: def.id,
          targetUserId: occ.targetUserId,
          plannedAtUtc: occ.plannedAtUtc,
        },
      });

      if (!existing) {
        await this.occRepo.save(occ);
        await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "scheduled", {
          plannedAtUtc: occ.plannedAtUtc.toISOString(),
        });
        createdCount++;
      }
    }

    return createdCount;
  }

  public async advanceRollingWindow(windowDays = 14): Promise<number> {
    const activeDefs = await this.defRepo.find({ where: { activeStatus: "active" } });
    let totalCreated = 0;
    for (const def of activeDefs) {
      totalCreated += await this.populateOccurrencesForDefinition(def, windowDays);
    }
    return totalCreated;
  }
}
