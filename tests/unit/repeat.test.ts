import { describe, expect, it } from "vitest";
import { calculateRepeat } from "../../src/domain/occurrences/repeat.js";

describe("calculateRepeat", () => {
  const intervals = [5, 10, 20, 40];
  const maxRepeats = 4;
  const deliveryTime = new Date("2026-10-19T06:00:00.000Z");

  it("calculates auto-repeat delays correctly", () => {
    // 1st repeat: index 0 -> 5 min
    const res1 = calculateRepeat(0, maxRepeats, intervals, deliveryTime);
    expect(res1.allowed).toBe(true);
    expect(res1.repeatCount).toBe(1);
    expect(res1.delayMinutes).toBe(5);
    expect(res1.nextDueAtUtc).toEqual(new Date("2026-10-19T06:05:00.000Z"));

    // 2nd repeat: index 1 -> 10 min
    const res2 = calculateRepeat(1, maxRepeats, intervals, deliveryTime);
    expect(res2.delayMinutes).toBe(10);
    expect(res2.nextDueAtUtc).toEqual(new Date("2026-10-19T06:10:00.000Z"));

    // 3rd repeat: index 2 -> 20 min
    const res3 = calculateRepeat(2, maxRepeats, intervals, deliveryTime);
    expect(res3.delayMinutes).toBe(20);

    // 4th repeat: index 3 -> 40 min
    const res4 = calculateRepeat(3, maxRepeats, intervals, deliveryTime);
    expect(res4.delayMinutes).toBe(40);
  });

  it("declares deadlinePassed once max repeats are exhausted", () => {
    const res = calculateRepeat(4, maxRepeats, intervals, deliveryTime);
    expect(res.allowed).toBe(false);
    expect(res.deadlinePassed).toBe(true);
    expect(res.reason).toBe("Maximum auto-repeat count reached");
  });

  it("falls back to default intervals if empty array passed", () => {
    const res = calculateRepeat(0, maxRepeats, [], deliveryTime);
    expect(res.allowed).toBe(true);
    expect(res.delayMinutes).toBe(5);
  });

  it("falls back to 5 minutes if interval item is undefined", () => {
    const res = calculateRepeat(0, maxRepeats, [undefined as any], deliveryTime);
    expect(res.allowed).toBe(true);
    expect(res.delayMinutes).toBe(5);
  });
});
