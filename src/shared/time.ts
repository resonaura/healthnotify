export function getTodayDateInZone(timeZone = "America/Vancouver", now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now); // Returns YYYY-MM-DD
}

export function addDaysToDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day! + days));
  return d.toISOString().slice(0, 10);
}

export function localTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  // Estimate as UTC first
  const approxUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0, 0);

  // Format approx in target timezone to find offset
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(approxUtc));
  const p = (type: string) => {
    const val = Number(parts.find((part) => part.type === type)?.value ?? 0);
    // Intl format may return 24 for hour 0 on some systems
    return type === "hour" && val === 24 ? 0 : val;
  };

  const targetDateAsUtc = Date.UTC(
    p("year"),
    p("month") - 1,
    p("day"),
    p("hour"),
    p("minute"),
    p("second"),
  );
  const offsetMs = targetDateAsUtc - approxUtc;

  return new Date(approxUtc - offsetMs);
}

export function formatTimeInZone(date: Date, timeZone = "America/Vancouver"): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatter.format(date);
}

export function formatDateInZone(date: Date, timeZone = "America/Vancouver"): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function daysBetween(dateStrA: string, dateStrB: string): number {
  const [y1, m1, d1] = dateStrA.split("-").map(Number);
  const [y2, m2, d2] = dateStrB.split("-").map(Number);
  const utcA = Date.UTC(y1!, m1! - 1, d1!);
  const utcB = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}

export function parseTimesInput(inputStr: string): string[] {
  const normalized = inputStr.toLowerCase().trim();
  const times = new Set<string>();

  // 1. Preset phrases
  if (/каждые\s*4\s*час/iu.test(normalized)) return ["08:00", "12:00", "16:00", "20:00"];
  if (/каждые\s*6\s*час/iu.test(normalized)) return ["06:00", "12:00", "18:00"];
  if (/каждые\s*8\s*час/iu.test(normalized)) return ["08:00", "16:00"];
  if (/каждые\s*12\s*час/iu.test(normalized)) return ["08:00", "20:00"];
  if (/2\s*раза?\s*в\s*день/iu.test(normalized)) return ["08:00", "20:00"];
  if (/3\s*раза?\s*в\s*день/iu.test(normalized)) return ["08:00", "14:00", "20:00"];
  if (/4\s*раза?\s*в\s*день/iu.test(normalized)) return ["08:00", "12:00", "16:00", "20:00"];
  if (/утром?\s*и\s*вечером?/iu.test(normalized)) return ["08:00", "20:00"];
  if (/утром?,\s*днем?\s*и\s*вечером?/iu.test(normalized)) return ["08:00", "14:00", "20:00"];
  if (/перед\s*сном/iu.test(normalized)) return ["22:00"];

  // 2. Tokenizer for times: matches "6 утра", "8 вечера", "06:00", "20:00", "6:30 am", "8pm", "6 и 20"
  const regex = /(?:в\s+)?(\d{1,2})(?::(\d{2}))?\s*(утра?|вечера?|дня?|ночи|am|pm)?/giu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    let hour = parseInt(match[1]!, 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const mod = match[3] ? match[3].toLowerCase() : null;

    if (isNaN(hour) || hour < 0 || hour > 24) continue;
    if (isNaN(minute) || minute < 0 || minute > 59) continue;

    if (mod) {
      if (mod.startsWith("вечер") || mod === "pm") {
        if (hour < 12) hour += 12;
      } else if (mod.startsWith("дн")) {
        if (hour < 12) hour += 12;
      } else if (mod.startsWith("утр") || mod === "am") {
        if (hour === 12) hour = 0;
      } else if (mod.startsWith("ноч")) {
        if (hour === 12) hour = 0;
      }
    }

    if (hour >= 0 && hour <= 23) {
      const hStr = String(hour).padStart(2, "0");
      const mStr = String(minute).padStart(2, "0");
      times.add(`${hStr}:${mStr}`);
    }
  }

  return Array.from(times).sort();
}
