import { Bot } from "grammy";
import type { DataSource } from "typeorm";
import { createBot } from "./bot/bot.js";
import { registerBotHandlers } from "./bot/register.js";
import type { AppEnv } from "./config/env.js";
import { readEnv } from "./config/env.js";
import { getDataSource } from "./persistence/data-source.js";
import {
  AppSetting,
  BotUser,
  DeliveryAttempt,
  HealthMeasurement,
  RegisteredChat,
  ReminderDefinition,
  ReminderEvent,
  ReminderOccurrence,
} from "./persistence/entities/index.js";
import { SettingsStore } from "./persistence/settings.store.js";
import { SchedulerRecovery } from "./scheduler/recovery.js";
import { SchedulerWorker } from "./scheduler/worker.js";
import { DeliveryService } from "./services/delivery.service.js";
import { HistoryService } from "./services/history.service.js";
import { OccurrenceService } from "./services/occurrence.service.js";
import { ReminderService } from "./services/reminder.service.js";
import { logger } from "./shared/logger.js";

export interface AppInstance {
  bot: Bot;
  dataSource: DataSource;
  worker: SchedulerWorker;
  reminderService: ReminderService;
  occurrenceService: OccurrenceService;
  historyService: HistoryService;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createApp(env: AppEnv = readEnv()): Promise<AppInstance> {
  const dataSource = await getDataSource(env.DATABASE_FILE);

  const appSettingRepo = dataSource.getRepository(AppSetting);
  const userRepo = dataSource.getRepository(BotUser);
  const chatRepo = dataSource.getRepository(RegisteredChat);
  const defRepo = dataSource.getRepository(ReminderDefinition);
  const occRepo = dataSource.getRepository(ReminderOccurrence);
  const attemptRepo = dataSource.getRepository(DeliveryAttempt);
  const eventRepo = dataSource.getRepository(ReminderEvent);
  const measRepo = dataSource.getRepository(HealthMeasurement);

  const settingsStore = new SettingsStore(appSettingRepo);
  const bot = createBot(env);

  const deliveryService = new DeliveryService(bot.api);
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

  const recovery = new SchedulerRecovery(
    occRepo,
    occurrenceService,
    deliveryService,
    historyService,
  );
  const worker = new SchedulerWorker(
    occurrenceService,
    recovery,
    env.SCHEDULER_INTERVAL_SECONDS,
    env.CATCH_UP_WINDOW_MINUTES,
  );

  registerBotHandlers({
    bot,
    env,
    settings: settingsStore,
    reminderService,
    occurrenceService,
    historyService,
    userRepo,
    chatRepo,
    occRepo,
  });

  return {
    bot,
    dataSource,
    worker,
    reminderService,
    occurrenceService,
    historyService,
    async start(): Promise<void> {
      logger.info("Initializing HealthNotify application...");

      // Start Scheduler Worker
      await worker.start();

      // Start grammY Long Polling
      logger.info("Starting Telegram Bot polling...");
      void bot.start({
        onStart: (botInfo) => {
          logger.info(`Bot @${botInfo.username} (${botInfo.first_name}) is online and polling!`);
        },
      });
    },
    async stop(): Promise<void> {
      logger.info("Shutting down application...");
      await worker.stop();
      await bot.stop();
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
      logger.info("Application cleanly stopped.");
    },
  };
}
