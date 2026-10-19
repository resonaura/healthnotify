import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  formatDateInZone,
  formatTimeInZone,
  getTodayDateInZone,
  localTimeToUtc,
} from "./time.js";

describe("time utilities", () => {
  it("converts Moscow local time to exact UTC date", () => {
    // Europe/Moscow is UTC+3 all year round
    const utcDate = localTimeToUtc("2026-10-19", "06:00", "Europe/Moscow");
    expect(utcDate.toISOString()).toBe("2026-10-19T03:00:00.000Z");

    const utcEvening = localTimeToUtc("2026-10-19", "20:00", "Europe/Moscow");
    expect(utcEvening.toISOString()).toBe("2026-10-19T17:00:00.000Z");
  });

  it("formats time back correctly in the timezone", () => {
    const utcDate = new Date("2026-10-19T03:00:00.000Z");
    expect(formatTimeInZone(utcDate, "Europe/Moscow")).toBe("06:00");
    expect(formatDateInZone(utcDate, "Europe/Moscow")).toBe("2026-10-19");
  });

  it("handles date arithmetic correctly", () => {
    expect(addDaysToDate("2026-10-19", 1)).toBe("2026-10-20");
    expect(addDaysToDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("gets today date in zone", () => {
    const testDate = new Date("2026-10-19T00:30:00.000Z"); // 03:30 MSK on 2026-10-19
    expect(getTodayDateInZone("Europe/Moscow", testDate)).toBe("2026-10-19");
  });
});
