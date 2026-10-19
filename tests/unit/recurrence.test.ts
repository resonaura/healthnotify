import { describe, expect, it } from "vitest";
import { generateOccurrenceCandidates } from "../../src/scheduler/recurrence.js";
import { ReminderDefinition } from "../../src/persistence/entities/reminder-definition.entity.js";
import { parseTimesInput } from "../../src/shared/time.js";

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

  it("supports interval schedule every 2 days with multiple times per day", () => {
    const def = new ReminderDefinition();
    def.id = 6;
    def.title = "Take Probiotics";
    def.createdByUserId = 359079621;
    def.targetUserIdsJson = JSON.stringify([915156343]);
    def.scheduleType = "interval";
    def.daysOfWeekJson = JSON.stringify([2]); // Every 2 days
    def.timesOfDayJson = JSON.stringify(["06:00", "20:00"]); // 2 times per day
    def.timezone = "America/Vancouver";
    def.startDate = "2026-10-19";
    def.endDate = "2026-10-25"; // 7 days (19th, 21st, 23rd, 25th = 4 active days)

    const candidates = generateOccurrenceCandidates(def, "2026-10-19", "2026-10-25");
    // 4 active days * 2 times = 8 occurrences
    expect(candidates).toHaveLength(8);

    // Verify first day occurrences on 2026-10-19 (Pacific Daylight Time UTC-7)
    // 06:00 PDT -> 13:00 UTC, 20:00 PDT -> 03:00 UTC next day
    expect(candidates[0]?.plannedAtUtc.toISOString()).toBe("2026-10-19T13:00:00.000Z");
    expect(candidates[1]?.plannedAtUtc.toISOString()).toBe("2026-10-20T03:00:00.000Z");
  });

  it("supports interval schedule every 3 days with 3 times per day", () => {
    const def = new ReminderDefinition();
    def.id = 7;
    def.title = "Measure Temperature";
    def.createdByUserId = 359079621;
    def.targetUserIdsJson = JSON.stringify([915156343]);
    def.scheduleType = "interval";
    def.daysOfWeekJson = JSON.stringify([3]); // Every 3 days
    def.timesOfDayJson = JSON.stringify(["08:00", "14:00", "20:00"]);
    def.timezone = "America/Vancouver";
    def.startDate = "2026-10-19";
    def.endDate = "2026-10-25"; // 7 days: day 0 (19th), day 3 (22nd), day 6 (25th) = 3 active days

    const candidates = generateOccurrenceCandidates(def, "2026-10-19", "2026-10-25");
    // 3 active days * 3 times = 9 occurrences
    expect(candidates).toHaveLength(9);
  });
});

describe("parseTimesInput natural language parsing", () => {
  it("parses informal Russian times like 'В 6 утра и 8 вечера'", () => {
    const times = parseTimesInput("В 6 утра и 8 вечера");
    expect(times).toEqual(["06:00", "20:00"]);
  });

  it("parses short numbers '6 и 20'", () => {
    const times = parseTimesInput("6 и 20");
    expect(times).toEqual(["06:00", "20:00"]);
  });

  it("parses Russian presets like 'каждые 4 часа'", () => {
    expect(parseTimesInput("каждые 4 часа")).toEqual(["08:00", "12:00", "16:00", "20:00"]);
    expect(parseTimesInput("3 раза в день")).toEqual(["08:00", "14:00", "20:00"]);
    expect(parseTimesInput("утром и вечером")).toEqual(["08:00", "20:00"]);
  });

  it("parses English 12h formats like '6am and 8pm' or '8:30am, 9:15pm'", () => {
    expect(parseTimesInput("6am and 8pm")).toEqual(["06:00", "20:00"]);
    expect(parseTimesInput("8:30am, 9:15pm")).toEqual(["08:30", "21:15"]);
  });

  it("parses standard 24-hour comma-separated formats", () => {
    expect(parseTimesInput("06:00, 20:00")).toEqual(["06:00", "20:00"]);
    expect(parseTimesInput("08:00, 14:00, 20:00")).toEqual(["08:00", "14:00", "20:00"]);
  });
});
