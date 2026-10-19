import { confirm, input, password, select } from "@inquirer/prompts";
import { config as loadDotEnv } from "dotenv";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Bot } from "grammy";
import { envSchema } from "../src/config/env.js";

loadDotEnv();

async function main(): Promise<void> {
  console.log("==================================================");
  console.log("🩺 HealthNotify — Interactive Setup & Onboarding");
  console.log("==================================================\n");

  const envFilePath = resolve(".env");
  let hasExisting = false;

  try {
    await readFile(envFilePath, "utf8");
    hasExisting = true;
  } catch {
    hasExisting = false;
  }

  if (hasExisting) {
    console.log("Found an existing .env configuration.");
    const shouldBackup = await confirm({
      message: "Create a timestamped backup before modifying?",
      default: true,
    });
    if (shouldBackup) {
      const backupPath = resolve(`.env.backup.${Date.now()}`);
      await copyFile(envFilePath, backupPath);
      console.log(`Backup saved to ${backupPath}`);
    }
  }

  // 1. Bot Token
  let botToken = process.env.TG_BOT_TOKEN || "";
  let botInfo: { username: string; firstName: string } | null = null;

  while (!botInfo) {
    if (!botToken) {
      botToken = await password({
        message: "Enter Telegram Bot Token from @BotFather:",
        mask: "*",
      });
    }

    if (!/^\d+:[A-Za-z0-9_-]{30,}$/u.test(botToken)) {
      console.error("Invalid token format. It must look like 123456789:ABCdef...");
      botToken = "";
      continue;
    }

    try {
      console.log("Validating bot token with Telegram API...");
      const bot = new Bot(botToken);
      const me = await bot.api.getMe();
      botInfo = { username: me.username, firstName: me.first_name };
      console.log(`Verified bot: @${me.username} (${me.first_name})`);
    } catch (err) {
      console.error("Failed to connect to Telegram API with this token:", (err as Error).message);
      const retry = await confirm({
        message: "Would you like to enter a different token?",
        default: true,
      });
      if (!retry) process.exit(1);
      botToken = "";
    }
  }

  // 2. Admin IDs
  const currentAdmins = process.env.TG_ADMIN_USER_IDS || "359079621, 261171441";
  const adminIdsInput = await input({
    message: "Enter Telegram User IDs of Admins (comma-separated):",
    default: currentAdmins,
    validate: (val) => {
      const parts = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0 || parts.some((p) => !/^\d+$/u.test(p))) {
        return "Please enter one or more numeric Telegram User IDs separated by commas";
      }
      return true;
    },
  });

  // 3. Default Group Chat ID
  const currentGroup = process.env.DEFAULT_GROUP_CHAT_ID || "-1004301185075";
  const groupChatIdInput = await input({
    message: "Default family group chat ID for reminders (press Enter to skip):",
    default: currentGroup,
  });

  // 4. Default Recipient User ID (Optional)
  const currentRecipient = process.env.DEFAULT_RECIPIENT_USER_ID || "";
  const recipientUserIdInput = await input({
    message: "Default recipient Telegram user ID (optional, press Enter to leave empty):",
    default: currentRecipient,
  });

  // 5. Timezone
  const timezoneChoices = [
    { name: "America/Vancouver (Pacific Time, UTC-7 / UTC-8)", value: "America/Vancouver" },
    { name: "Europe/Kyiv (UTC+2 / UTC+3 DST)", value: "Europe/Kyiv" },
    { name: "UTC", value: "UTC" },
    { name: "America/New_York (Eastern)", value: "America/New_York" },
    { name: "Europe/Moscow (UTC+3)", value: "Europe/Moscow" },
    { name: "Asia/Almaty", value: "Asia/Almaty" },
    { name: "Other (custom input)", value: "custom" },
  ];

  let selectedTimezone = await select({
    message: "Select default timezone for reminder schedules:",
    choices: timezoneChoices,
    default: process.env.DEFAULT_TIMEZONE || "America/Vancouver",
  });

  if (selectedTimezone === "custom") {
    selectedTimezone = await input({
      message: "Enter custom IANA timezone (e.g. Europe/Warsaw, Asia/Tbilisi):",
      validate: (tz) => {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: tz });
          return true;
        } catch {
          return "Invalid IANA timezone name";
        }
      },
    });
  }

  // 6. Default Locale
  const selectedLocale = await select({
    message: "Select default interface language:",
    choices: [
      { name: "Русский (ru)", value: "ru" },
      { name: "English (en)", value: "en" },
    ],
    default: process.env.DEFAULT_LOCALE === "en" ? "en" : "ru",
  });

  // 7. Database Path
  const dbPath = await input({
    message: "SQLite database file path:",
    default: process.env.DATABASE_FILE || ".data/healthnotify.sqlite",
  });

  // Build configuration object for validation
  const candidateConfig = {
    TG_BOT_TOKEN: botToken,
    TG_ADMIN_USER_IDS: adminIdsInput,
    DEFAULT_GROUP_CHAT_ID: groupChatIdInput,
    DEFAULT_RECIPIENT_USER_ID: recipientUserIdInput,
    DATABASE_FILE: dbPath,
    DEFAULT_TIMEZONE: selectedTimezone,
    DEFAULT_LOCALE: selectedLocale,
    SCHEDULER_INTERVAL_SECONDS: process.env.SCHEDULER_INTERVAL_SECONDS || "10",
    CATCH_UP_WINDOW_MINUTES: process.env.CATCH_UP_WINDOW_MINUTES || "60",
    DEFAULT_SNOOZE_INTERVALS: process.env.DEFAULT_SNOOZE_INTERVALS || "5,10,20,40,60",
    DEFAULT_AUTO_REPEAT_INTERVALS: process.env.DEFAULT_AUTO_REPEAT_INTERVALS || "5,10,20,40",
    MAX_AUTO_REPEAT_COUNT: process.env.MAX_AUTO_REPEAT_COUNT || "4",
    MAX_SNOOZE_COUNT: process.env.MAX_SNOOZE_COUNT || "5",
  };

  // Validate with Zod
  const parsed = envSchema.safeParse(candidateConfig);
  if (!parsed.success) {
    console.error("Configuration validation failed:");
    for (const issue of parsed.error.issues) {
      console.error(`- ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  // Display safe preview
  console.log("\n--- Configuration Preview ---");
  console.log(`Bot Account: @${botInfo.username}`);
  console.log(`Bot Token: [REDACTED_BOT_TOKEN]`);
  console.log(`Admins: ${parsed.data.TG_ADMIN_USER_IDS.join(", ")}`);
  console.log(`Default Group Chat: ${parsed.data.DEFAULT_GROUP_CHAT_ID ?? "None"}`);
  console.log(`Default Recipient: ${parsed.data.DEFAULT_RECIPIENT_USER_ID ?? "None"}`);
  console.log(`Timezone: ${parsed.data.DEFAULT_TIMEZONE}`);
  console.log(`Locale: ${parsed.data.DEFAULT_LOCALE}`);
  console.log(`Database: ${parsed.data.DATABASE_FILE}`);
  console.log("-----------------------------\n");

  const saveConfirmed = await confirm({
    message: "Save configuration to .env?",
    default: true,
  });

  if (!saveConfirmed) {
    console.log("Setup aborted without saving.");
    process.exit(0);
  }

  // Ensure directory for database exists
  const dbDir = dirname(resolve(parsed.data.DATABASE_FILE));
  await mkdir(dbDir, { recursive: true, mode: 0o700 });

  // Generate .env file contents
  const envLines = [
    `# HealthNotify Telegram Bot Configuration`,
    `# Generated at ${new Date().toISOString()}`,
    `TG_BOT_TOKEN=${botToken}`,
    `TG_ADMIN_USER_IDS=${parsed.data.TG_ADMIN_USER_IDS.join(",")}`,
    parsed.data.DEFAULT_GROUP_CHAT_ID
      ? `DEFAULT_GROUP_CHAT_ID=${parsed.data.DEFAULT_GROUP_CHAT_ID}`
      : "",
    parsed.data.DEFAULT_RECIPIENT_USER_ID
      ? `DEFAULT_RECIPIENT_USER_ID=${parsed.data.DEFAULT_RECIPIENT_USER_ID}`
      : "",
    `DATABASE_FILE=${parsed.data.DATABASE_FILE}`,
    `DEFAULT_TIMEZONE=${parsed.data.DEFAULT_TIMEZONE}`,
    `DEFAULT_LOCALE=${parsed.data.DEFAULT_LOCALE}`,
    `SCHEDULER_INTERVAL_SECONDS=${parsed.data.SCHEDULER_INTERVAL_SECONDS}`,
    `CATCH_UP_WINDOW_MINUTES=${parsed.data.CATCH_UP_WINDOW_MINUTES}`,
    `DEFAULT_SNOOZE_INTERVALS=${parsed.data.DEFAULT_SNOOZE_INTERVALS.join(",")}`,
    `DEFAULT_AUTO_REPEAT_INTERVALS=${parsed.data.DEFAULT_AUTO_REPEAT_INTERVALS.join(",")}`,
    `MAX_AUTO_REPEAT_COUNT=${parsed.data.MAX_AUTO_REPEAT_COUNT}`,
    `MAX_SNOOZE_COUNT=${parsed.data.MAX_SNOOZE_COUNT}`,
  ].filter(Boolean);

  await writeFile(envFilePath, `${envLines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`\nConfiguration saved successfully to ${envFilePath} (permissions 0600).`);
  console.log(`Next steps:`);
  console.log(`- Start development mode: npm run dev`);
  console.log(`- Run tests: npm run test`);
  console.log(`- Build production bundle: npm run build\n`);
}

main().catch((err) => {
  console.error("Setup error:", err);
  process.exit(1);
});
