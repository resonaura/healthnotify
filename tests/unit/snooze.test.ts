import { describe, expect, it } from "vitest";
import { calculateSnooze } from "../../src/domain/occurrences/snooze.js";

describe("calculateSnooze", () => {
  const intervals = [5, 10, 20, 40, 60];
  const maxSnooze = 5;
  const baseTime = new Date("2026-10-19T06:00:00.000Z");

  it("calculates progression correctly through all steps", () => {
    // 1st snooze: index 0 -> 5 min
    const res1 = calculateSnooze(0, maxSnooze, intervals, baseTime);
    expect(res1.allowed).toBe(true);
    expect(res1.snoozeCount).toBe(1);
    expect(res1.delayMinutes).toBe(5);
    expect(res1.nextDueAtUtc).toEqual(new Date("2026-10-19T06:05:00.000Z"));

    // 2nd snooze: index 1 -> 10 min
    const res2 = calculateSnooze(1, maxSnooze, intervals, baseTime);
    expect(res2.delayMinutes).toBe(10);
    expect(res2.nextDueAtUtc).toEqual(new Date("2026-10-19T06:10:00.000Z"));

    // 3rd snooze: index 2 -> 20 min
    const res3 = calculateSnooze(2, maxSnooze, intervals, baseTime);
    expect(res3.delayMinutes).toBe(20);

    // 4th snooze: index 3 -> 40 min
    const res4 = calculateSnooze(3, maxSnooze, intervals, baseTime);
    expect(res4.delayMinutes).toBe(40);

    // 5th snooze: index 4 -> 60 min
    const res5 = calculateSnooze(4, maxSnooze, intervals, baseTime);
    expect(res5.delayMinutes).toBe(60);
  });

  it("rejects snoozing once maxSnoozeCount is reached", () => {
    const res = calculateSnooze(5, maxSnooze, intervals, baseTime);
    expect(res.allowed).toBe(false);
    expect(res.snoozeCount).toBe(5);
    expect(res.reason).toBe("Maximum snooze limit reached");
  });

  it("falls back to default intervals if empty array passed", () => {
    const res = calculateSnooze(0, maxSnooze, [], baseTime);
    expect(res.allowed).toBe(true);
    expect(res.delayMinutes).toBe(5);
  });

  it("falls back to 5 minutes if interval item is undefined", () => {
    const res = calculateSnooze(0, maxSnooze, [undefined as any], baseTime);
    expect(res.allowed).toBe(true);
    expect(res.delayMinutes).toBe(5);
  });
});
