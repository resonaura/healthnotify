export function getTodayDateInZone(timeZone = "Europe/Moscow", now = new Date()): string {
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

export function formatTimeInZone(date: Date, timeZone = "Europe/Moscow"): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatter.format(date);
}

export function formatDateInZone(date: Date, timeZone = "Europe/Moscow"): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}
