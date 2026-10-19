import type { EntityManager, Repository } from "typeorm";
import type {
  HealthMeasurement,
  HealthMeasurementType,
} from "../persistence/entities/health-measurement.entity.js";
import {
  ReminderEvent,
  type ReminderEventType,
} from "../persistence/entities/reminder-event.entity.js";
import type { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";

export interface ComplianceStats {
  totalOccurrences: number;
  completed: number;
  skipped: number;
  missed: number;
  snoozes: number;
  completionRate: number;
}

export class HistoryService {
  constructor(
    private readonly eventRepo: Repository<ReminderEvent>,
    private readonly occRepo: Repository<ReminderOccurrence>,
    private readonly measurementRepo: Repository<HealthMeasurement>,
  ) {}

  public async logEvent(
    occurrenceId: string,
    reminderDefinitionId: number,
    targetUserId: number,
    actorUserId: number,
    eventType: ReminderEventType,
    payload?: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<ReminderEvent> {
    const repo = manager ? manager.getRepository(ReminderEvent) : this.eventRepo;
    const event = repo.create({
      occurrenceId,
      reminderDefinitionId,
      targetUserId,
      actorUserId,
      eventType,
      payloadJson: payload ? JSON.stringify(payload) : null,
      createdAtUtc: new Date(),
    });
    return repo.save(event);
  }

  public async recordMeasurement(
    targetUserId: number,
    type: HealthMeasurementType,
    value: Record<string, unknown>,
    occurrenceId: string | null = null,
    note: string | null = null,
    manager?: EntityManager,
  ): Promise<HealthMeasurement> {
    const repo = manager
      ? manager.getRepository(this.measurementRepo.target)
      : this.measurementRepo;
    const record = repo.create({
      targetUserId,
      occurrenceId,
      measurementType: type,
      valueJson: JSON.stringify(value),
      note,
      recordedAtUtc: new Date(),
    });
    return repo.save(record);
  }

  public async getComplianceStats(
    targetUserId?: number,
    sinceUtc?: Date,
  ): Promise<ComplianceStats> {
    const qb = this.occRepo.createQueryBuilder("occ");

    if (targetUserId) {
      qb.andWhere("occ.targetUserId = :targetUserId", { targetUserId });
    }
    if (sinceUtc) {
      qb.andWhere("occ.plannedAtUtc >= :sinceUtc", { sinceUtc });
    }

    const occurrences = await qb.getMany();

    let completed = 0;
    let skipped = 0;
    let missed = 0;
    let snoozes = 0;

    for (const occ of occurrences) {
      if (occ.status === "COMPLETED") completed++;
      if (occ.status === "SKIPPED") skipped++;
      if (occ.status === "MISSED") missed++;
      snoozes += occ.snoozeCount;
    }

    const evaluated = completed + skipped + missed;
    const completionRate = evaluated > 0 ? Math.round((completed / evaluated) * 100) : 100;

    return {
      totalOccurrences: occurrences.length,
      completed,
      skipped,
      missed,
      snoozes,
      completionRate,
    };
  }

  public async listUserHistory(targetUserId: number, limit = 20): Promise<ReminderOccurrence[]> {
    return this.occRepo.find({
      where: { targetUserId },
      order: { plannedAtUtc: "DESC" },
      take: limit,
    });
  }

  public async listUserMeasurements(
    targetUserId: number,
    limit = 20,
  ): Promise<HealthMeasurement[]> {
    return this.measurementRepo.find({
      where: { targetUserId },
      order: { recordedAtUtc: "DESC" },
      take: limit,
    });
  }

  public async deleteUserHealthData(targetUserId: number): Promise<void> {
    await this.measurementRepo.delete({ targetUserId });
  }
}
