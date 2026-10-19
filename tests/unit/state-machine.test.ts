import { describe, expect, it } from "vitest";
import {
  OccurrenceStateMachine,
  isTerminalStatus,
} from "../../src/domain/occurrences/state-machine.js";
import { ReminderOccurrence } from "../../src/persistence/entities/reminder-occurrence.entity.js";
import { ConflictError, ValidationError } from "../../src/shared/errors.js";

describe("OccurrenceStateMachine", () => {
  function makeOccurrence(): ReminderOccurrence {
    const occ = new ReminderOccurrence();
    occ.id = "occ-test-1";
    occ.reminderDefinitionId = 10;
    occ.targetUserId = 915156343;
    occ.plannedAtUtc = new Date("2026-10-19T06:00:00Z");
    occ.dueAtUtc = new Date("2026-10-19T06:00:00Z");
    occ.status = "SCHEDULED";
    occ.snoozeCount = 0;
    occ.repeatCount = 0;
    return occ;
  }

  it("handles standard flow: SCHEDULED -> PENDING -> SNOOZED -> COMPLETED", () => {
    const occ = makeOccurrence();
    const now = new Date("2026-10-19T06:00:00Z");

    OccurrenceStateMachine.markPending(occ, -1004301185075, 555, now);
    expect(occ.status).toBe("PENDING");
    expect(occ.activeMessageId).toBe(555);
    expect(occ.lastDeliveredAtUtc).toEqual(now);

    const snoozedUntil = new Date("2026-10-19T06:05:00Z");
    OccurrenceStateMachine.markSnoozed(occ, snoozedUntil, now);
    expect(occ.status).toBe("SNOOZED");
    expect(occ.snoozeCount).toBe(1);
    expect(occ.snoozedUntilUtc).toEqual(snoozedUntil);
    expect(occ.dueAtUtc).toEqual(snoozedUntil);

    const completedAt = new Date("2026-10-19T06:03:00Z");
    OccurrenceStateMachine.markCompleted(occ, completedAt);
    expect(occ.status).toBe("COMPLETED");
    expect(occ.completedAtUtc).toEqual(completedAt);
    expect(isTerminalStatus(occ.status)).toBe(true);
  });

  it("handles SKIPPED, MISSED, and UNKNOWN terminal transitions", () => {
    const occ1 = makeOccurrence();
    OccurrenceStateMachine.markPending(occ1, -1004301185075, 100);
    OccurrenceStateMachine.markSkipped(occ1);
    expect(occ1.status).toBe("SKIPPED");
    expect(isTerminalStatus(occ1.status)).toBe(true);

    const occ2 = makeOccurrence();
    OccurrenceStateMachine.markPending(occ2, -1004301185075, 101);
    OccurrenceStateMachine.markMissed(occ2);
    expect(occ2.status).toBe("MISSED");
    expect(isTerminalStatus(occ2.status)).toBe(true);

    const occ3 = makeOccurrence();
    OccurrenceStateMachine.markPending(occ3, -1004301185075, 102);
    OccurrenceStateMachine.markUnknown(occ3);
    expect(occ3.status).toBe("UNKNOWN");
    expect(isTerminalStatus(occ3.status)).toBe(true);
  });

  it("handles CANCELLED transition from SCHEDULED and PENDING", () => {
    const occ1 = makeOccurrence();
    OccurrenceStateMachine.markCancelled(occ1);
    expect(occ1.status).toBe("CANCELLED");

    const occ2 = makeOccurrence();
    OccurrenceStateMachine.markPending(occ2, -1004301185075, 102);
    OccurrenceStateMachine.markCancelled(occ2);
    expect(occ2.status).toBe("CANCELLED");
  });

  it("handles auto-repeat (PENDING -> PENDING) with incrementing counter", () => {
    const occ = makeOccurrence();
    OccurrenceStateMachine.markPending(occ, -1004301185075, 100);
    expect(occ.repeatCount).toBe(0);

    const nextDue = new Date("2026-10-19T06:05:00Z");
    OccurrenceStateMachine.markRepeated(occ, -1004301185075, 200, nextDue);
    expect(occ.status).toBe("PENDING");
    expect(occ.repeatCount).toBe(1);
    expect(occ.activeMessageId).toBe(200);
    expect(occ.dueAtUtc).toEqual(nextDue);
  });

  it("strictly forbids any transition out of terminal states (ConflictError)", () => {
    const occ = makeOccurrence();
    OccurrenceStateMachine.markPending(occ, 1, 1);
    OccurrenceStateMachine.markCompleted(occ);

    expect(() => OccurrenceStateMachine.markPending(occ, 1, 1)).toThrow(ConflictError);
    expect(() => OccurrenceStateMachine.markSnoozed(occ, new Date())).toThrow(ConflictError);
    expect(() => OccurrenceStateMachine.markSkipped(occ)).toThrow(ConflictError);
    expect(() => OccurrenceStateMachine.markMissed(occ)).toThrow(ConflictError);
    expect(() => OccurrenceStateMachine.markUnknown(occ)).toThrow(ConflictError);
  });

  it("strictly forbids invalid non-terminal transitions (ValidationError)", () => {
    const occ = makeOccurrence();
    // Cannot jump from SCHEDULED directly to COMPLETED without delivery
    expect(() => OccurrenceStateMachine.markCompleted(occ)).toThrow(ValidationError);
    // Cannot jump from SCHEDULED to SNOOZED without being delivered
    expect(() => OccurrenceStateMachine.markSnoozed(occ, new Date())).toThrow(ValidationError);
  });
});
