import { describe, expect, it } from "vitest";
import { generateOccurrenceCandidates } from "../../src/scheduler/recurrence.js";
import { ReminderDefinition } from "../../src/persistence/entities/reminder-definition.entity.js";

describe("recurrence generator", () => {
  it("generates exactly 28 occurrences for 14 days, 2 times daily, 1 user", () => {
    const def = new ReminderDefinition();
    def.id = 1;
    def.title = "Blood Pressure Check";
    def.createdByUserId = 359079621;
    def.targetUserIdsJson = JSON.stringify([915156343]);
    def.scheduleType = "daily";
    def.timesOfDayJson = JSON.stringify(["06:00", "20:00"]);
    def.timezone = "Europe/Moscow";
    def.startDate = "2026-10-19";
    def.endDate = "2026-11-01"; // 14 days inclusive

    const candidates = generateOccurrenceCandidates(def, "2026-10-19", "2026-11-01");
    expect(candidates).toHaveLength(28);

    // Verify first day occurrences
    expect(candidates[0]?.plannedAtUtc.toISOString()).toBe("2026-10-19T03:00:00.000Z"); // 06:00 MSK
    expect(candidates[1]?.plannedAtUtc.toISOString()).toBe("2026-10-19T17:00:00.000Z"); // 20:00 MSK

    // Verify last day occurrences
    expect(candidates[26]?.plannedAtUtc.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(candidates[27]?.plannedAtUtc.toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("generates separate independent occurrences for each recipient", () => {
    const def = new ReminderDefinition();
    def.id = 2;
    def.title = "Take Vitamins";
    def.createdByUserId = 359079621;
    def.targetUserIdsJson = JSON.stringify([359079621, 261171441]);
    def.scheduleType = "daily";
    def.timesOfDayJson = JSON.stringify(["10:00"]);
    def.timezone = "Europe/Moscow";
    def.startDate = "2026-10-19";
    def.endDate = "2026-10-21"; // 3 days

    const candidates = generateOccurrenceCandidates(def, "2026-10-19", "2026-10-21");
    // 3 days * 1 time * 2 users = 6 occurrences
    expect(candidates).toHaveLength(6);

    const user1Occs = candidates.filter((c) => c.targetUserId === 359079621);
    const user2Occs = candidates.filter((c) => c.targetUserId === 261171441);
    expect(user1Occs).toHaveLength(3);
    expect(user2Occs).toHaveLength(3);
    // All occurrences must have unique UUIDs
    const uniqueIds = new Set(candidates.map((c) => c.id));
    expect(uniqueIds.size).toBe(6);
  });

  it("generates occurrences only on allowed weekdays", () => {
    const def = new ReminderDefinition();
    def.id = 3;
    def.title = "Workday Medication";
    def.createdByUserId = 359079621;
    def.targetUserIdsJson = JSON.stringify([915156343]);
    def.scheduleType = "weekdays";
    def.daysOfWeekJson = JSON.stringify([1, 3, 5]); // Mon, Wed, Fri
    def.timesOfDayJson = JSON.stringify(["09:00"]);
    def.timezone = "Europe/Moscow";
    // 2026-10-19 is Monday, 2026-10-25 is Sunday (1 week)
    def.startDate = "2026-10-19";
    def.endDate = "2026-10-25";

    const candidates = generateOccurrenceCandidates(def, "2026-10-19", "2026-10-25");
    // Mon, Wed, Fri = 3 occurrences
    expect(candidates).toHaveLength(3);
  });

  it("handles scheduleType 'once' for exactly one date", () => {
    const def = new ReminderDefinition();
    def.id = 4;
    def.title = "Doctor Appointment";
    def.createdByUserId = 359079621;
    def.targetUserIdsJson = JSON.stringify([915156343]);
    def.scheduleType = "once";
    def.timesOfDayJson = JSON.stringify(["14:00"]);
    def.timezone = "Europe/Moscow";
    def.startDate = "2026-10-19";
    def.endDate = "2026-10-19";

    const candidates = generateOccurrenceCandidates(def, "2026-10-19", "2026-10-25");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.plannedAtUtc.toISOString()).toBe("2026-10-19T11:00:00.000Z"); // 14:00 MSK = 11:00 UTC
  });

  it("returns empty array if start window is after end window", () => {
    const def = new ReminderDefinition();
    def.id = 5;
    def.title = "Past Event";
    def.createdByUserId = 359079621;
    def.targetUserIdsJson = JSON.stringify([915156343]);
    def.scheduleType = "daily";
    def.timesOfDayJson = JSON.stringify(["10:00"]);
    def.timezone = "Europe/Moscow";
    def.startDate = "2026-10-25";
    def.endDate = "2026-10-20";

    const candidates = generateOccurrenceCandidates(def, "2026-10-25", "2026-10-20");
    expect(candidates).toHaveLength(0);
  });
});
