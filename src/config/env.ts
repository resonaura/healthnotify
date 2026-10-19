import { z } from "zod";

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parseNumberList(value: string | undefined): number[] {
  if (!value || !value.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && !Number.isNaN(n));
}

function normalizeChatId(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(raw.trim());
  if (Number.isNaN(num)) return null;
  // If positive 10-digit group ID like 4301185075, convert to Telegram supergroup format -1004301185075
  if (num > 1_000_000_000) {
    return -Number(`100${num}`);
  }
  return num;
}

export const envSchema = z.object({
  TG_BOT_TOKEN: z
    .string()
    .min(1, "TG_BOT_TOKEN is required")
    .regex(/^\d+:[A-Za-z0-9_-]{30,}$/u, "Invalid Telegram bot token format"),
  TG_ADMIN_USER_IDS: z
    .string()
    .min(1, "TG_ADMIN_USER_IDS is required")
    .transform(parseNumberList)
    .pipe(
      z
        .array(z.number().int().positive())
        .min(1, "At least one valid numeric TG_ADMIN_USER_IDS is required"),
    ),
  DEFAULT_GROUP_CHAT_ID: z.union([z.string(), z.number()]).optional().transform(normalizeChatId),
  DEFAULT_RECIPIENT_USER_ID: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return null;
      const num = Number(val);
      return Number.isInteger(num) && num > 0 ? num : null;
    }),
  DATABASE_FILE: z.string().default(".data/healthnotify.sqlite"),
  DEFAULT_TIMEZONE: z
    .string()
    .default("America/Vancouver")
    .refine(isValidTimezone, { message: "Invalid IANA timezone" }),
  DEFAULT_LOCALE: z.enum(["ru", "en"]).default("ru"),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(300).default(10),
  CATCH_UP_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  DEFAULT_SNOOZE_INTERVALS: z
    .string()
    .default("5,10,20,40,60")
    .transform(parseNumberList)
    .pipe(z.array(z.number().int().positive()).min(1)),
  DEFAULT_AUTO_REPEAT_INTERVALS: z
    .string()
    .default("5,10,20,40")
    .transform(parseNumberList)
    .pipe(z.array(z.number().int().positive()).min(1)),
  MAX_AUTO_REPEAT_COUNT: z.coerce.number().int().min(1).max(20).default(4),
  MAX_SNOOZE_COUNT: z.coerce.number().int().min(1).max(20).default(5),
});

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source);
}

export function isAdmin(userId: number, env: AppEnv): boolean {
  return env.TG_ADMIN_USER_IDS.includes(userId);
}
