import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  daysBetween,
  formatDateInZone,
  formatTimeInZone,
  getTodayDateInZone,
  localTimeToUtc,
  parseTimesInput,
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

  it("calculates daysBetween two dates correctly", () => {
    expect(daysBetween("2026-10-19", "2026-10-21")).toBe(2);
    expect(daysBetween("2026-10-21", "2026-10-19")).toBe(-2);
    expect(daysBetween("2026-10-19", "2026-10-19")).toBe(0);
  });

  it("parses all preset phrases in parseTimesInput", () => {
    expect(parseTimesInput("каждые 4 часа")).toEqual(["08:00", "12:00", "16:00", "20:00"]);
    expect(parseTimesInput("каждые 6 часов")).toEqual(["06:00", "12:00", "18:00"]);
    expect(parseTimesInput("каждые 8 часов")).toEqual(["08:00", "16:00"]);
    expect(parseTimesInput("каждые 12 часов")).toEqual(["08:00", "20:00"]);
    expect(parseTimesInput("2 раза в день")).toEqual(["08:00", "20:00"]);
    expect(parseTimesInput("3 раза в день")).toEqual(["08:00", "14:00", "20:00"]);
    expect(parseTimesInput("4 раза в день")).toEqual(["08:00", "12:00", "16:00", "20:00"]);
    expect(parseTimesInput("утром и вечером")).toEqual(["08:00", "20:00"]);
    expect(parseTimesInput("утром, днем и вечером")).toEqual(["08:00", "14:00", "20:00"]);
    expect(parseTimesInput("перед сном")).toEqual(["22:00"]);
  });

  it("handles time modifiers in Russian and English", () => {
    expect(parseTimesInput("12 ночи")).toEqual(["00:00"]);
    expect(parseTimesInput("12 дня")).toEqual(["12:00"]);
    expect(parseTimesInput("2 дня")).toEqual(["14:00"]);
    expect(parseTimesInput("12am and 12pm")).toEqual(["00:00", "12:00"]);
    expect(parseTimesInput("7 утра и 9 вечера")).toEqual(["07:00", "21:00"]);
  });

  it("ignores invalid hours and minutes", () => {
    expect(parseTimesInput("25:00 and 10:99 and abc")).toEqual([]);
  });
});
