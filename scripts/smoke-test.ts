import "dotenv/config";
import { Bot } from "grammy";
import { makeDataSource } from "../src/persistence/data-source.js";
import {
  BotUser,
  DeliveryAttempt,
  HealthMeasurement,
  RegisteredChat,
  ReminderDefinition,
  ReminderEvent,
  ReminderOccurrence,
} from "../src/persistence/entities/index.js";
import { DeliveryService } from "../src/services/delivery.service.js";
import { HistoryService } from "../src/services/history.service.js";
import { OccurrenceService } from "../src/services/occurrence.service.js";
import { ReminderService } from "../src/services/reminder.service.js";
import { ConflictError, ForbiddenError } from "../src/shared/errors.js";

async function runSmokeTest(): Promise<void> {
  console.log("🚀 Starting live Telegram & SQLite smoke test...");

  const token = process.env.TG_BOT_TOKEN;
  if (!token) throw new Error("TG_BOT_TOKEN is required in .env");

  const dbFile =
    process.env.DATABASE_FILE ||
    "/home/resonaura/.local/share/healthnotify/data/healthnotify.sqlite";
  console.log(`📦 Connecting to database: ${dbFile}`);
  const dataSource = makeDataSource(dbFile);
  await dataSource.initialize();
  await dataSource.runMigrations();

  const bot = new Bot(token);
  const deliveryService = new DeliveryService(bot.api);

  const eventRepo = dataSource.getRepository(ReminderEvent);
  const occRepo = dataSource.getRepository(ReminderOccurrence);
  const defRepo = dataSource.getRepository(ReminderDefinition);
  const userRepo = dataSource.getRepository(BotUser);
  const chatRepo = dataSource.getRepository(RegisteredChat);
  const attemptRepo = dataSource.getRepository(DeliveryAttempt);
  const measRepo = dataSource.getRepository(HealthMeasurement);

  const historyService = new HistoryService(eventRepo, occRepo, measRepo);
  const reminderService = new ReminderService(defRepo, occRepo, historyService);
  const occurrenceService = new OccurrenceService(
    occRepo,
    defRepo,
    userRepo,
    attemptRepo,
    deliveryService,
    historyService,
  );

  const adminId = 359079621;
  const fatherId = 915156343;
  const targetGroupChatId = -1003783492202; // Supergroup supporting inline buttons

  console.log("👤 Seeding registered users and target chat...");
  await userRepo.save(
    userRepo.create({
      id: fatherId,
      firstName: "Отец",
      lastName: "Иванович",
      username: null,
      role: "USER",
      dmActive: false,
      language: "ru",
      dataConsent: true,
    }),
  );

  await userRepo.save(
    userRepo.create({
      id: adminId,
      firstName: "Admin",
      username: "resocat",
      role: "ADMIN",
      dmActive: true,
      language: "ru",
      dataConsent: true,
    }),
  );

  await chatRepo.save(
    chatRepo.create({
      id: targetGroupChatId,
      title: "Health Notify Supergroup",
      chatType: "supergroup",
      addedByUserId: adminId,
    }),
  );

  console.log("📋 1. Creating live reminder rule for father in supergroup...");
  const def = await reminderService.createReminder(
    {
      title: "Измерить артериальное давление (Live Test)",
      description: "Утренний замер давления перед едой",
      category: "measurement",
      targetUserIds: [fatherId],
      destinationChatId: targetGroupChatId,
      destinationType: "group",
      scheduleType: "once",
      timesOfDay: ["12:00"],
      startDate: new Date().toISOString().slice(0, 10),
    },
    adminId,
  );
  console.log(`✅ Created reminder #${def.id}: «${def.title}»`);

  const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;
  console.log(`📌 Found occurrence: ${occ.id}, status=${occ.status}`);

  console.log("📤 2. Delivering live reminder card to Telegram...");
  await occurrenceService.processDueOccurrence(occ.id);

  const deliveredOcc = (await occRepo.findOneBy({ id: occ.id }))!;
  console.log(
    `✅ Delivered to Telegram! messageId=${deliveredOcc.activeMessageId}, chatId=${deliveredOcc.activeMessageChatId}, status=${deliveredOcc.status}`,
  );

  if (!deliveredOcc.activeMessageId) {
    throw new Error("Delivery failed: activeMessageId not set!");
  }

  console.log("🔒 3. Testing inline card freshness guard (obsolete message rejection)...");
  try {
    await occurrenceService.handleUserAction(
      occ.id,
      "done",
      fatherId,
      new Date(),
      99999999, // Stale message ID
    );
    throw new Error("Should have thrown ConflictError for stale message!");
  } catch (err) {
    if (err instanceof ConflictError) {
      console.log(`✅ Freshness check passed: rejected stale message with: "${err.message}"`);
    } else {
      throw err;
    }
  }

  console.log("🚫 4. Testing authorization guard (non-target user click)...");
  try {
    await occurrenceService.handleUserAction(
      occ.id,
      "done",
      adminId,
      new Date(),
      deliveredOcc.activeMessageId,
    );
    throw new Error("Should have thrown ForbiddenError for non-target user!");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      console.log(`✅ Auth guard passed: rejected unauthorized click with: "${err.message}"`);
    } else {
      throw err;
    }
  }

  console.log("🕒 5. Testing Snooze action (5 min delay)...");
  const snoozeRes = await occurrenceService.handleUserAction(
    occ.id,
    "snooze",
    fatherId,
    new Date(),
    deliveredOcc.activeMessageId,
  );
  console.log(`✅ Snooze response: "${snoozeRes.message}"`);

  const snoozedOcc = (await occRepo.findOneBy({ id: occ.id }))!;
  console.log(
    `📊 Occurrence after snooze: status=${snoozedOcc.status}, snoozeCount=${snoozedOcc.snoozeCount}, snoozedUntil=${snoozedOcc.snoozedUntilUtc?.toISOString()}`,
  );

  console.log("✅ 6. Testing Done action (completion)...");
  const doneRes = await occurrenceService.handleUserAction(
    occ.id,
    "done",
    fatherId,
    new Date(),
    deliveredOcc.activeMessageId,
  );
  console.log(`✅ Done response: "${doneRes.message}"`);

  const doneOcc = (await occRepo.findOneBy({ id: occ.id }))!;
  console.log(
    `📊 Occurrence after completion: status=${doneOcc.status}, completedAt=${doneOcc.completedAtUtc?.toISOString()}`,
  );

  console.log("📊 7. Verifying history events and compliance stats...");
  const events = await eventRepo.find({
    where: { occurrenceId: occ.id },
    order: { createdAtUtc: "ASC" },
  });
  console.log(`📜 Logged ${events.length} history events:`);
  for (const ev of events) {
    console.log(
      `   - ${ev.eventType} by actor ${ev.actorUserId} at ${ev.createdAtUtc.toISOString()}`,
    );
  }

  const stats = await historyService.getComplianceStats(fatherId);
  console.log(`📈 Compliance stats for Father: ${JSON.stringify(stats)}`);

  console.log("🎉 SMOKE TEST PASSED WITH 100% SUCCESS!");
  await dataSource.destroy();
}

runSmokeTest().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
