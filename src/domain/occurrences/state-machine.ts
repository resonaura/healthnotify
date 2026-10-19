import type {
  OccurrenceStatus,
  ReminderOccurrence,
} from "../../persistence/entities/reminder-occurrence.entity.js";
import { ConflictError, ValidationError } from "../../shared/errors.js";

export const TERMINAL_STATUSES: readonly OccurrenceStatus[] = [
  "COMPLETED",
  "SKIPPED",
  "MISSED",
  "UNKNOWN",
  "CANCELLED",
] as const;

export function isTerminalStatus(status: OccurrenceStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

const ALLOWED_TRANSITIONS: Record<OccurrenceStatus, readonly OccurrenceStatus[]> = {
  SCHEDULED: ["PENDING", "MISSED", "UNKNOWN", "CANCELLED"],
  PENDING: ["COMPLETED", "SNOOZED", "SKIPPED", "PENDING", "MISSED", "UNKNOWN", "CANCELLED"],
  SNOOZED: ["COMPLETED", "SKIPPED", "PENDING", "CANCELLED", "UNKNOWN"],
  COMPLETED: [],
  SKIPPED: [],
  MISSED: [],
  UNKNOWN: [],
  CANCELLED: [],
};

export class OccurrenceStateMachine {
  public static canTransition(from: OccurrenceStatus, to: OccurrenceStatus): boolean {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }

  public static assertCanTransition(
    from: OccurrenceStatus,
    to: OccurrenceStatus,
    id: string,
  ): void {
    if (isTerminalStatus(from)) {
      throw new ConflictError(
        `Occurrence ${id} is in terminal state '${from}' and cannot transition to '${to}'`,
      );
    }
    if (!this.canTransition(from, to)) {
      throw new ValidationError(
        `Invalid occurrence state transition from '${from}' to '${to}' for occurrence ${id}`,
      );
    }
  }

  public static markPending(
    occ: ReminderOccurrence,
    chatId: number,
    messageId: number,
    deliveredAt: Date = new Date(),
    nextDueAtUtc?: Date,
  ): void {
    this.assertCanTransition(occ.status, "PENDING", occ.id);
    occ.status = "PENDING";
    occ.lastDeliveredAtUtc = deliveredAt;
    if (nextDueAtUtc) {
      occ.dueAtUtc = nextDueAtUtc;
    }
    occ.activeMessageChatId = chatId;
    occ.activeMessageId = messageId;
    occ.updatedAt = deliveredAt;
  }

  public static markRepeated(
    occ: ReminderOccurrence,
    chatId: number,
    messageId: number,
    nextDueAtUtc: Date,
    repeatedAt: Date = new Date(),
  ): void {
    this.assertCanTransition(occ.status, "PENDING", occ.id);
    occ.status = "PENDING";
    occ.repeatCount += 1;
    occ.lastDeliveredAtUtc = repeatedAt;
    occ.dueAtUtc = nextDueAtUtc;
    occ.activeMessageChatId = chatId;
    occ.activeMessageId = messageId;
    occ.updatedAt = repeatedAt;
  }

  public static markSnoozed(
    occ: ReminderOccurrence,
    snoozedUntilUtc: Date,
    snoozedAt: Date = new Date(),
  ): void {
    this.assertCanTransition(occ.status, "SNOOZED", occ.id);
    occ.status = "SNOOZED";
    occ.snoozeCount += 1;
    occ.snoozedUntilUtc = snoozedUntilUtc;
    occ.dueAtUtc = snoozedUntilUtc;
    occ.updatedAt = snoozedAt;
  }

  public static markCompleted(occ: ReminderOccurrence, completedAt: Date = new Date()): void {
    this.assertCanTransition(occ.status, "COMPLETED", occ.id);
    occ.status = "COMPLETED";
    occ.completedAtUtc = completedAt;
    occ.updatedAt = completedAt;
  }

  public static markSkipped(occ: ReminderOccurrence, skippedAt: Date = new Date()): void {
    this.assertCanTransition(occ.status, "SKIPPED", occ.id);
    occ.status = "SKIPPED";
    occ.skippedAtUtc = skippedAt;
    occ.updatedAt = skippedAt;
  }

  public static markMissed(occ: ReminderOccurrence, missedAt: Date = new Date()): void {
    this.assertCanTransition(occ.status, "MISSED", occ.id);
    occ.status = "MISSED";
    occ.missedAtUtc = missedAt;
    occ.updatedAt = missedAt;
  }

  public static markUnknown(occ: ReminderOccurrence, unknownAt: Date = new Date()): void {
    this.assertCanTransition(occ.status, "UNKNOWN", occ.id);
    occ.status = "UNKNOWN";
    occ.missedAtUtc = unknownAt;
    occ.updatedAt = unknownAt;
  }

  public static markCancelled(occ: ReminderOccurrence, cancelledAt: Date = new Date()): void {
    this.assertCanTransition(occ.status, "CANCELLED", occ.id);
    occ.status = "CANCELLED";
    occ.cancelledAtUtc = cancelledAt;
    occ.updatedAt = cancelledAt;
  }
}
