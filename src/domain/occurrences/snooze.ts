export interface SnoozeResult {
  allowed: boolean;
  snoozeCount: number;
  delayMinutes: number;
  nextDueAtUtc: Date;
  reason?: string;
}

export function calculateSnooze(
  currentSnoozeCount: number,
  maxSnoozeCount: number,
  intervals: number[],
  now: Date = new Date(),
): SnoozeResult {
  if (currentSnoozeCount >= maxSnoozeCount) {
    return {
      allowed: false,
      snoozeCount: currentSnoozeCount,
      delayMinutes: 0,
      nextDueAtUtc: now,
      reason: "Maximum snooze limit reached",
    };
  }

  const safeIntervals = intervals.length > 0 ? intervals : [5, 10, 20, 40, 60];
  const index = Math.min(currentSnoozeCount, safeIntervals.length - 1);
  const delayMinutes = safeIntervals[index] ?? 5;
  const nextDueAtUtc = new Date(now.getTime() + delayMinutes * 60 * 1000);

  return {
    allowed: true,
    snoozeCount: currentSnoozeCount + 1,
    delayMinutes,
    nextDueAtUtc,
  };
}
