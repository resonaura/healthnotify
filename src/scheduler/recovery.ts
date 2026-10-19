import type { Repository } from "typeorm";
import { OccurrenceStateMachine } from "../domain/occurrences/state-machine.js";
import { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";
import type { DeliveryService } from "../services/delivery.service.js";
import type { HistoryService } from "../services/history.service.js";
import type { OccurrenceService } from "../services/occurrence.service.js";
import { logger } from "../shared/logger.js";

export class SchedulerRecovery {
  constructor(
    private readonly occRepo: Repository<ReminderOccurrence>,
    private readonly occurrenceService: OccurrenceService,
    private readonly deliveryService: DeliveryService,
    private readonly historyService: HistoryService,
  ) {}

  public async reconcileOverdueOccurrences(
    catchUpWindowMinutes = 60,
    now: Date = new Date(),
  ): Promise<{ recoveredCount: number; expiredMissedCount: number }> {
    const overdueOccs = await this.occRepo
      .createQueryBuilder("occ")
      .where("occ.status IN ('SCHEDULED', 'PENDING', 'SNOOZED')")
      .andWhere("occ.dueAtUtc < :now", { now })
      .orderBy("occ.dueAtUtc", "ASC")
      .getMany();

    let recoveredCount = 0;
    let expiredMissedCount = 0;

    for (const occ of overdueOccs) {
      const overdueMinutes = (now.getTime() - occ.dueAtUtc.getTime()) / (1000 * 60);

      if (overdueMinutes <= catchUpWindowMinutes) {
        // Within catch-up window: deliver now
        logger.info(
          `Catch-up: Processing overdue occurrence ${occ.id} (${Math.round(overdueMinutes)}m late)`,
        );
        try {
          await this.occurrenceService.processDueOccurrence(occ.id, now);
          recoveredCount++;
        } catch (err) {
          logger.error(`Catch-up delivery failed for occurrence ${occ.id}:`, err);
        }
      } else {
        // Too late: mark as MISSED to avoid spamming the user
        logger.warn(
          `Catch-up expired: Marking occurrence ${occ.id} as MISSED (${Math.round(overdueMinutes)}m overdue)`,
        );
        OccurrenceStateMachine.markMissed(occ, now);
        await this.occRepo.save(occ);

        if (occ.activeMessageChatId && occ.activeMessageId) {
          await this.deliveryService.deactivateButtons(
            occ.activeMessageChatId,
            occ.activeMessageId,
          );
        }

        await this.historyService.logEvent(
          occ.id,
          occ.reminderDefinitionId,
          occ.targetUserId,
          0,
          "missed",
          { reason: "catch_up_expired", overdueMinutes: Math.round(overdueMinutes) },
        );
        expiredMissedCount++;
      }
    }

    return { recoveredCount, expiredMissedCount };
  }
}
