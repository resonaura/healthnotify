import type { Repository } from "typeorm";
import { assertCanActOnOccurrence } from "../domain/users/auth.guard.js";
import { OccurrenceStateMachine } from "../domain/occurrences/state-machine.js";
import { calculateRepeat } from "../domain/occurrences/repeat.js";
import { calculateSnooze } from "../domain/occurrences/snooze.js";
import type { Locale } from "../i18n/index.js";
import { t } from "../i18n/index.js";
import type { BotUser } from "../persistence/entities/bot-user.entity.js";
import { DeliveryAttempt } from "../persistence/entities/delivery-attempt.entity.js";
import type { ReminderDefinition } from "../persistence/entities/reminder-definition.entity.js";
import { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";
import { ConflictError, NotFoundError } from "../shared/errors.js";
import { formatTimeInZone } from "../shared/time.js";
import type { DeliveryService } from "./delivery.service.js";
import type { HistoryService } from "./history.service.js";

export type UserActionType = "done" | "snooze" | "skip";

export interface ActionResult {
  success: boolean;
  message: string;
  status: string;
}

export class OccurrenceService {
  constructor(
    private readonly occRepo: Repository<ReminderOccurrence>,
    private readonly defRepo: Repository<ReminderDefinition>,
    private readonly userRepo: Repository<BotUser>,
    private readonly attemptRepo: Repository<DeliveryAttempt>,
    private readonly deliveryService: DeliveryService,
    private readonly historyService: HistoryService,
  ) {}

  public async findDueOccurrences(
    now: Date = new Date(),
    limit = 50,
  ): Promise<ReminderOccurrence[]> {
    return this.occRepo
      .createQueryBuilder("occ")
      .where("occ.status IN ('SCHEDULED', 'PENDING', 'SNOOZED')")
      .andWhere("occ.dueAtUtc <= :now", { now })
      .orderBy("occ.dueAtUtc", "ASC")
      .take(limit)
      .getMany();
  }

  public async processDueOccurrence(occurrenceId: string, now: Date = new Date()): Promise<void> {
    const occ = await this.occRepo.findOneBy({ id: occurrenceId });
    if (!occ) return;

    const def = await this.defRepo.findOneBy({ id: occ.reminderDefinitionId });
    if (!def || def.activeStatus !== "active") return;

    const user = await this.userRepo.findOneBy({ id: occ.targetUserId });
    const fallbackUser: BotUser =
      user ??
      ({
        id: occ.targetUserId,
        firstName: `User ${occ.targetUserId}`,
        role: "USER",
        dmActive: false,
        language: "ru",
        dataConsent: true,
      } as BotUser);

    const lang = (fallbackUser.language === "en" ? "en" : "ru") as Locale;

    // Consecutive occurrence policy:
    // If this is a new SCHEDULED occurrence, check if there's an older unhandled occurrence for the same rule & user.
    if (occ.status === "SCHEDULED") {
      const activePreceding = await this.occRepo
        .createQueryBuilder("preceding")
        .where("preceding.reminderDefinitionId = :defId", { defId: def.id })
        .andWhere("preceding.targetUserId = :targetUserId", { targetUserId: occ.targetUserId })
        .andWhere("preceding.id != :currentId", { currentId: occ.id })
        .andWhere("preceding.status IN ('PENDING', 'SNOOZED')")
        .getMany();

      for (const oldOcc of activePreceding) {
        OccurrenceStateMachine.markMissed(oldOcc, now);
        await this.occRepo.save(oldOcc);
        if (oldOcc.activeMessageChatId && oldOcc.activeMessageId) {
          await this.deliveryService.deactivateButtons(
            oldOcc.activeMessageChatId,
            oldOcc.activeMessageId,
          );
        }
        await this.historyService.logEvent(oldOcc.id, def.id, oldOcc.targetUserId, 0, "missed", {
          reason: "superceded_by_consecutive_occurrence",
        });
      }
    }

    // 1. Initial delivery: SCHEDULED -> PENDING
    if (occ.status === "SCHEDULED") {
      try {
        const messageId = await this.deliveryService.sendReminderCard(
          def,
          occ,
          fallbackUser,
          def.destinationChatId,
          lang,
        );

        OccurrenceStateMachine.markPending(occ, def.destinationChatId, messageId, now);
        await this.occRepo.save(occ);

        await this.recordAttempt(occ.id, def.destinationChatId, "initial", "success", messageId);
        await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "sent", {
          messageId,
          destinationChatId: def.destinationChatId,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.recordAttempt(occ.id, def.destinationChatId, "initial", "failed", null, errMsg);
        await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "delivery_failed", {
          error: errMsg,
        });
      }
      return;
    }

    // 2. Snooze delivery: SNOOZED -> PENDING
    if (occ.status === "SNOOZED") {
      if (occ.activeMessageChatId && occ.activeMessageId) {
        await this.deliveryService.deactivateButtons(occ.activeMessageChatId, occ.activeMessageId);
      }

      try {
        const messageId = await this.deliveryService.sendReminderCard(
          def,
          occ,
          fallbackUser,
          def.destinationChatId,
          lang,
        );

        OccurrenceStateMachine.markPending(occ, def.destinationChatId, messageId, now);
        await this.occRepo.save(occ);

        await this.recordAttempt(occ.id, def.destinationChatId, "snooze", "success", messageId);
        await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "sent", {
          type: "snooze_reminder",
          messageId,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.recordAttempt(occ.id, def.destinationChatId, "snooze", "failed", null, errMsg);
      }
      return;
    }

    // 3. Auto-repeat delivery on ignore: PENDING -> PENDING or MISSED
    if (occ.status === "PENDING") {
      const repeatRes = calculateRepeat(
        occ.repeatCount,
        def.maxAutoRepeatCount,
        def.getAutoRepeatIntervals(),
        occ.lastDeliveredAtUtc ?? occ.plannedAtUtc,
        now,
      );

      if (repeatRes.allowed) {
        if (occ.activeMessageChatId && occ.activeMessageId) {
          await this.deliveryService.deactivateButtons(
            occ.activeMessageChatId,
            occ.activeMessageId,
          );
        }

        try {
          const messageId = await this.deliveryService.sendReminderCard(
            def,
            occ,
            fallbackUser,
            def.destinationChatId,
            lang,
          );

          OccurrenceStateMachine.markRepeated(
            occ,
            def.destinationChatId,
            messageId,
            repeatRes.nextDueAtUtc,
            now,
          );
          await this.occRepo.save(occ);

          await this.recordAttempt(occ.id, def.destinationChatId, "repeat", "success", messageId);
          await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "repeated", {
            repeatCount: occ.repeatCount,
            messageId,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.recordAttempt(occ.id, def.destinationChatId, "repeat", "failed", null, errMsg);
        }
      } else {
        // Max repeats reached and deadline passed -> MISSED
        OccurrenceStateMachine.markMissed(occ, now);
        await this.occRepo.save(occ);

        if (occ.activeMessageChatId && occ.activeMessageId) {
          await this.deliveryService.deactivateButtons(
            occ.activeMessageChatId,
            occ.activeMessageId,
          );
        }

        await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "missed", {
          reason: "max_repeats_exhausted",
        });
      }
    }
  }

  public async handleUserAction(
    occurrenceId: string,
    action: UserActionType,
    userId: number,
    now: Date = new Date(),
  ): Promise<ActionResult> {
    const occ = await this.occRepo.findOneBy({ id: occurrenceId });
    if (!occ) {
      throw new NotFoundError(`Occurrence ${occurrenceId} not found`);
    }

    const def = await this.defRepo.findOneBy({ id: occ.reminderDefinitionId });
    if (!def) {
      throw new NotFoundError(`Reminder definition for occurrence ${occurrenceId} not found`);
    }

    const user = await this.userRepo.findOneBy({ id: userId });
    const lang = (user?.language === "en" ? "en" : "ru") as Locale;

    // Check authorization: only the targeted user can perform actions
    assertCanActOnOccurrence(userId, occ.targetUserId, occurrenceId);

    // If occurrence is already completed / skipped / missed
    if (["COMPLETED", "SKIPPED", "MISSED", "CANCELLED"].includes(occ.status)) {
      throw new ConflictError(t(lang, "reminder_already_handled"));
    }

    if (action === "done") {
      OccurrenceStateMachine.markCompleted(occ, now);
      await this.occRepo.save(occ);

      await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, userId, "completed", {
        completedAt: now.toISOString(),
      });

      if (occ.activeMessageChatId && occ.activeMessageId) {
        await this.deliveryService.deactivateButtons(occ.activeMessageChatId, occ.activeMessageId);
      }

      return {
        success: true,
        message: t(lang, "reminder_done_ack"),
        status: occ.status,
      };
    }

    if (action === "snooze") {
      const snoozeRes = calculateSnooze(
        occ.snoozeCount,
        def.maxSnoozeCount,
        def.getSnoozeIntervals(),
        now,
      );

      if (!snoozeRes.allowed) {
        return {
          success: false,
          message: snoozeRes.reason ?? "Maximum snooze limit reached",
          status: occ.status,
        };
      }

      OccurrenceStateMachine.markSnoozed(occ, snoozeRes.nextDueAtUtc, now);
      await this.occRepo.save(occ);

      await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, userId, "snoozed", {
        snoozeCount: occ.snoozeCount,
        snoozedUntil: snoozeRes.nextDueAtUtc.toISOString(),
      });

      // Update message card: keep Done & Skip, remove Later
      if (occ.activeMessageChatId && occ.activeMessageId) {
        await this.deliveryService.updateCardOnSnooze(
          occ.activeMessageChatId,
          occ.activeMessageId,
          "",
          snoozeRes.nextDueAtUtc,
          occ.snoozeCount,
          def.timezone,
          occ.id,
          lang,
        );
      }

      const timeStr = formatTimeInZone(snoozeRes.nextDueAtUtc, def.timezone);
      return {
        success: true,
        message: t(lang, "reminder_snoozed_ack", {
          minutes: snoozeRes.delayMinutes,
          time: timeStr,
        }),
        status: occ.status,
      };
    }

    if (action === "skip") {
      OccurrenceStateMachine.markSkipped(occ, now);
      await this.occRepo.save(occ);

      await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, userId, "skipped", {
        skippedAt: now.toISOString(),
      });

      if (occ.activeMessageChatId && occ.activeMessageId) {
        await this.deliveryService.deactivateButtons(occ.activeMessageChatId, occ.activeMessageId);
      }

      return {
        success: true,
        message: t(lang, "reminder_skipped_ack"),
        status: occ.status,
      };
    }

    return { success: false, message: "Unknown action", status: occ.status };
  }

  private async recordAttempt(
    occurrenceId: string,
    destinationChatId: number,
    attemptType: "initial" | "repeat" | "snooze",
    status: "success" | "failed",
    telegramMessageId: number | null = null,
    errorMessage: string | null = null,
  ): Promise<void> {
    const attempt = this.attemptRepo.create({
      occurrenceId,
      destinationChatId,
      attemptType,
      status,
      telegramMessageId,
      errorMessage,
      attemptedAtUtc: new Date(),
    });
    await this.attemptRepo.save(attempt);
  }
}
