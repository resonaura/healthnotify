export interface RepeatResult {
  allowed: boolean;
  repeatCount: number;
  delayMinutes: number;
  nextDueAtUtc: Date;
  deadlinePassed: boolean;
  reason?: string;
}

export function calculateRepeat(
  currentRepeatCount: number,
  maxRepeatCount: number,
  intervals: number[],
  referenceTimeUtc: Date,
  now: Date = new Date(),
): RepeatResult {
  const safeIntervals = intervals.length > 0 ? intervals : [5, 10, 20, 40];

  if (currentRepeatCount >= maxRepeatCount) {
    return {
      allowed: false,
      repeatCount: currentRepeatCount,
      delayMinutes: 0,
      nextDueAtUtc: now,
      deadlinePassed: true,
      reason: "Maximum auto-repeat count reached",
    };
  }

  const index = Math.min(currentRepeatCount, safeIntervals.length - 1);
  const delayMinutes = safeIntervals[index] ?? 5;
  const nextDueAtUtc = new Date(referenceTimeUtc.getTime() + delayMinutes * 60 * 1000);

  return {
    allowed: true,
    repeatCount: currentRepeatCount + 1,
    delayMinutes,
    nextDueAtUtc,
    deadlinePassed: false,
  };
}

export function calculateNextFollowUpDueAt(
  currentRepeatCount: number,
  maxRepeatCount: number,
  intervals: number[],
  now: Date = new Date(),
): Date {
  const safeIntervals = intervals.length > 0 ? intervals : [5, 10, 20, 40];
  const nextIndex = Math.min(Math.max(0, currentRepeatCount), safeIntervals.length - 1);
  const delayMinutes = safeIntervals[nextIndex] ?? 5;
  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}
