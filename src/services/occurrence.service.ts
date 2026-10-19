import type { Repository } from "typeorm";
import { assertCanActOnOccurrence } from "../domain/users/auth.guard.js";
import { OccurrenceStateMachine } from "../domain/occurrences/state-machine.js";
import { calculateNextFollowUpDueAt, calculateRepeat } from "../domain/occurrences/repeat.js";
import { calculateSnooze } from "../domain/occurrences/snooze.js";
import type { Locale } from "../i18n/index.js";
import { t } from "../i18n/index.js";
import { BotUser } from "../persistence/entities/bot-user.entity.js";
import { DeliveryAttempt } from "../persistence/entities/delivery-attempt.entity.js";
import { ReminderDefinition } from "../persistence/entities/reminder-definition.entity.js";
import { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";
import { ConflictError, NotFoundError } from "../shared/errors.js";
import { formatTimeInZone } from "../shared/time.js";
import { buildReminderMessageText, type DeliveryService } from "./delivery.service.js";
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

    const targetChatId = def.destinationType === "dm" ? occ.targetUserId : def.destinationChatId;
    const targetUser = await this.resolveTargetUser(occ.targetUserId, targetChatId);
    const lang = (targetUser.language === "en" ? "en" : "ru") as Locale;

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
          targetUser,
          targetChatId,
          lang,
        );

        const nextDueAtUtc = calculateNextFollowUpDueAt(
          0,
          def.maxAutoRepeatCount,
          def.getAutoRepeatIntervals(),
          now,
        );
        OccurrenceStateMachine.markPending(occ, targetChatId, messageId, now, nextDueAtUtc);
        await this.occRepo.save(occ);

        await this.recordAttempt(occ.id, targetChatId, "initial", "success", messageId);
        await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "sent", {
          messageId,
          destinationChatId: targetChatId,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.recordAttempt(occ.id, targetChatId, "initial", "failed", null, errMsg);
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
          targetUser,
          targetChatId,
          lang,
        );

        const nextDueAtUtc = calculateNextFollowUpDueAt(
          0,
          def.maxAutoRepeatCount,
          def.getAutoRepeatIntervals(),
          now,
        );
        OccurrenceStateMachine.markPending(occ, targetChatId, messageId, now, nextDueAtUtc);
        await this.occRepo.save(occ);

        await this.recordAttempt(occ.id, targetChatId, "snooze", "success", messageId);
        await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "sent", {
          type: "snooze_reminder",
          messageId,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.recordAttempt(occ.id, targetChatId, "snooze", "failed", null, errMsg);
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
            targetUser,
            targetChatId,
            lang,
          );

          const nextDueAtUtc = calculateNextFollowUpDueAt(
            occ.repeatCount + 1,
            def.maxAutoRepeatCount,
            def.getAutoRepeatIntervals(),
            now,
          );

          OccurrenceStateMachine.markRepeated(occ, targetChatId, messageId, nextDueAtUtc, now);
          await this.occRepo.save(occ);

          await this.recordAttempt(occ.id, targetChatId, "repeat", "success", messageId);
          await this.historyService.logEvent(occ.id, def.id, occ.targetUserId, 0, "repeated", {
            repeatCount: occ.repeatCount,
            messageId,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.recordAttempt(occ.id, targetChatId, "repeat", "failed", null, errMsg);
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
    sourceMessageId?: number,
    sourceChatId?: number,
  ): Promise<ActionResult> {
    const user = await this.userRepo.findOneBy({ id: userId });
    const lang = (user?.language === "en" ? "en" : "ru") as Locale;

    const txResult = await this.occRepo.manager.transaction(async (tx) => {
      const occ = await tx.findOne(ReminderOccurrence, { where: { id: occurrenceId } });
      if (!occ) {
        throw new NotFoundError(`Occurrence ${occurrenceId} not found`);
      }

      // Check authorization: only the targeted user can perform actions
      assertCanActOnOccurrence(userId, occ.targetUserId, occurrenceId);

      // Check source message freshness: prevent clicking obsolete cards from before an auto-repeat or re-send
      if (sourceMessageId && occ.activeMessageId && sourceMessageId !== occ.activeMessageId) {
        throw new ConflictError(t(lang, "reminder_card_outdated"));
      }
      if (sourceChatId && occ.activeMessageChatId && sourceChatId !== occ.activeMessageChatId) {
        throw new ConflictError(t(lang, "reminder_card_outdated"));
      }

      // If occurrence is already completed / skipped / missed / cancelled
      if (["COMPLETED", "SKIPPED", "MISSED", "CANCELLED"].includes(occ.status)) {
        throw new ConflictError(t(lang, "reminder_already_handled"));
      }

      const def = await tx.findOne(ReminderDefinition, { where: { id: occ.reminderDefinitionId } });
      if (!def) {
        throw new NotFoundError(`Reminder definition for occurrence ${occurrenceId} not found`);
      }

      const targetUser =
        (await tx.findOne(BotUser, { where: { id: occ.targetUserId } })) ??
        ({
          id: occ.targetUserId,
          firstName: `User ${occ.targetUserId}`,
          role: "USER",
          dmActive: false,
          language: "ru",
          dataConsent: true,
        } as BotUser);

      if (action === "done") {
        OccurrenceStateMachine.markCompleted(occ, now);
        await tx.save(occ);

        await this.historyService.logEvent(
          occ.id,
          def.id,
          occ.targetUserId,
          userId,
          "completed",
          { completedAt: now.toISOString() },
          tx,
        );

        return {
          action: "done" as const,
          occ,
          def,
          targetUser,
          snoozeRes: null,
          result: {
            success: true,
            message: t(lang, "reminder_done_ack"),
            status: occ.status,
          },
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
            action: "snooze" as const,
            occ,
            def,
            targetUser,
            snoozeRes,
            result: {
              success: false,
              message: snoozeRes.reason ?? "Maximum snooze limit reached",
              status: occ.status,
            },
          };
        }

        OccurrenceStateMachine.markSnoozed(occ, snoozeRes.nextDueAtUtc, now);
        await tx.save(occ);

        await this.historyService.logEvent(
          occ.id,
          def.id,
          occ.targetUserId,
          userId,
          "snoozed",
          {
            snoozeCount: occ.snoozeCount,
            snoozedUntil: snoozeRes.nextDueAtUtc.toISOString(),
          },
          tx,
        );

        const timeStr = formatTimeInZone(snoozeRes.nextDueAtUtc, def.timezone);
        return {
          action: "snooze" as const,
          occ,
          def,
          targetUser,
          snoozeRes,
          result: {
            success: true,
            message: t(lang, "reminder_snoozed_ack", {
              minutes: snoozeRes.delayMinutes,
              time: timeStr,
            }),
            status: occ.status,
          },
        };
      }

      if (action === "skip") {
        OccurrenceStateMachine.markSkipped(occ, now);
        await tx.save(occ);

        await this.historyService.logEvent(
          occ.id,
          def.id,
          occ.targetUserId,
          userId,
          "skipped",
          { skippedAt: now.toISOString() },
          tx,
        );

        return {
          action: "skip" as const,
          occ,
          def,
          targetUser,
          snoozeRes: null,
          result: {
            success: true,
            message: t(lang, "reminder_skipped_ack"),
            status: occ.status,
          },
        };
      }

      return {
        action: "unknown" as const,
        occ,
        def,
        targetUser,
        snoozeRes: null,
        result: { success: false, message: "Unknown action", status: occ.status },
      };
    });

    const { action: resolvedAction, occ, def, targetUser, result } = txResult;
    if (!result.success && resolvedAction === "snooze") {
      return result;
    }

    const targetChatId = def.destinationType === "dm" ? occ.targetUserId : def.destinationChatId;
    const activeChatId = occ.activeMessageChatId ?? targetChatId;

    if (activeChatId && occ.activeMessageId) {
      const baseText = buildReminderMessageText(def, occ, targetUser, activeChatId, lang);

      if (resolvedAction === "done") {
        await this.deliveryService.updateCardOnCompleted(
          activeChatId,
          occ.activeMessageId,
          baseText,
          now,
          def.timezone,
          lang,
        );
      } else if (resolvedAction === "snooze" && txResult.snoozeRes?.allowed) {
        await this.deliveryService.updateCardOnSnooze(
          activeChatId,
          occ.activeMessageId,
          baseText,
          txResult.snoozeRes.nextDueAtUtc,
          occ.snoozeCount,
          def.timezone,
          occ.id,
          lang,
        );
      } else if (resolvedAction === "skip") {
        await this.deliveryService.updateCardOnSkipped(
          activeChatId,
          occ.activeMessageId,
          baseText,
          now,
          def.timezone,
          lang,
        );
      }
    }

    return result;
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

  private async resolveTargetUser(targetUserId: number, targetChatId: number): Promise<BotUser> {
    let user = await this.userRepo.findOneBy({ id: targetUserId });

    const profile = await this.deliveryService.fetchUserProfile(targetUserId, targetChatId);
    if (profile) {
      if (!user) {
        user = this.userRepo.create({
          id: targetUserId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          username: profile.username,
          role: "USER",
          dmActive: false,
          language: "ru",
          dataConsent: true,
        });
      } else {
        user.firstName = profile.firstName;
        user.lastName = profile.lastName;
        user.username = profile.username;
      }
      await this.userRepo.save(user);
    }

    if (!user) {
      user = this.userRepo.create({
        id: targetUserId,
        firstName: `Пользователь`,
        lastName: null,
        username: null,
        role: "USER",
        dmActive: false,
        language: "ru",
        dataConsent: true,
      });
    }

    return user;
  }
}
