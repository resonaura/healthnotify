import { randomUUID } from "node:crypto";
import type { ReminderDefinition } from "../persistence/entities/reminder-definition.entity.js";
import { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";
import { addDaysToDate, localTimeToUtc } from "../shared/time.js";

export function getDayOfWeekNumber(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day!));
  const dayIndex = d.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  return dayIndex === 0 ? 7 : dayIndex; // Convert to 1=Mon ... 7=Sun
}

export function generateOccurrenceCandidates(
  definition: ReminderDefinition,
  windowStartDate: string,
  windowEndDate: string,
): ReminderOccurrence[] {
  const targetUserIds = definition.getTargetUserIds();
  const times = definition.getTimesOfDay();
  const allowedDays = definition.getDaysOfWeek();

  const occurrences: ReminderOccurrence[] = [];

  const start = definition.startDate > windowStartDate ? definition.startDate : windowStartDate;
  const end =
    definition.endDate && definition.endDate < windowEndDate ? definition.endDate : windowEndDate;

  if (start > end) return [];

  let currentDate = start;

  while (currentDate <= end) {
    if (definition.scheduleType === "once" && currentDate !== definition.startDate) {
      break;
    }

    if (definition.scheduleType === "weekdays" && allowedDays && allowedDays.length > 0) {
      const dayOfWeek = getDayOfWeekNumber(currentDate);
      if (!allowedDays.includes(dayOfWeek)) {
        currentDate = addDaysToDate(currentDate, 1);
        continue;
      }
    }

    for (const timeStr of times) {
      const plannedAtUtc = localTimeToUtc(currentDate, timeStr, definition.timezone);

      for (const targetUserId of targetUserIds) {
        const occ = new ReminderOccurrence();
        occ.id = randomUUID();
        occ.reminderDefinitionId = definition.id;
        occ.targetUserId = targetUserId;
        occ.plannedAtUtc = plannedAtUtc;
        occ.dueAtUtc = plannedAtUtc;
        occ.status = "SCHEDULED";
        occ.snoozeCount = 0;
        occ.repeatCount = 0;
        occurrences.push(occ);
      }
    }

    if (definition.scheduleType === "once") break;
    currentDate = addDaysToDate(currentDate, 1);
  }

  return occurrences;
}
