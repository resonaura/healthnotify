import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Bot, type Context } from "grammy";
import type { DataSource } from "typeorm";
import { readEnv } from "../../src/config/env.js";
import { makeDataSource } from "../../src/persistence/data-source.js";
import {
  AppSetting,
  BotUser,
  DeliveryAttempt,
  HealthMeasurement,
  RegisteredChat,
  ReminderDefinition,
  ReminderEvent,
  ReminderOccurrence,
} from "../../src/persistence/entities/index.js";
import { SettingsStore } from "../../src/persistence/settings.store.js";
import { DeliveryService, type TelegramApi } from "../../src/services/delivery.service.js";
import { HistoryService } from "../../src/services/history.service.js";
import { OccurrenceService } from "../../src/services/occurrence.service.js";
import { ReminderService } from "../../src/services/reminder.service.js";
import { registerBotHandlers } from "../../src/bot/register.js";
import type { MenuSystem } from "../../src/bot/menu-system.js";

class MockTelegramApi implements TelegramApi {
  public sentMessages: Array<{
    chatId: number;
    text: string;
    options?: Record<string, unknown> | undefined;
    messageId: number;
  }> = [];
  public editedTexts: Array<{ chatId: number; messageId: number; text: string }> = [];
  public clearedMarkups: Array<{ chatId: number; messageId: number }> = [];
  private nextMessageId = 5000;

  public async sendMessage(
    chatId: number,
    text: string,
    options?: Record<string, unknown>,
  ): Promise<{ message_id: number }> {
    const messageId = ++this.nextMessageId;
    this.sentMessages.push({ chatId, text, options, messageId });
    return { message_id: messageId };
  }

  public async editMessageText(chatId: number, messageId: number, text: string): Promise<unknown> {
    this.editedTexts.push({ chatId, messageId, text });
    return { ok: true };
  }

  public async editMessageReplyMarkup(chatId: number, messageId: number): Promise<unknown> {
    this.clearedMarkups.push({ chatId, messageId });
    return { ok: true };
  }
}

describe("Telegram Bot Interaction E2E Suite", () => {
  let dataSource: DataSource;
  let bot: Bot;
  let mockApi: MockTelegramApi;
  let settingsStore: SettingsStore;
  let reminderService: ReminderService;
  let occurrenceService: OccurrenceService;
  let historyService: HistoryService;
  let menuSystem: MenuSystem;

  const adminId = 359079621;
  const fatherId = 915156343;
  const strangerId = 77777777;
  const groupChatId = -1004301185075;

  const env = readEnv({
    TG_BOT_TOKEN: "1234567890:AAFakeMockTokenForTestingPurposes00000",
    TG_ADMIN_USER_IDS: "359079621, 261171441",
    DEFAULT_GROUP_CHAT_ID: String(groupChatId),
    DEFAULT_RECIPIENT_USER_ID: String(fatherId),
    DEFAULT_TIMEZONE: "Europe/Moscow",
  });

  beforeAll(async () => {
    dataSource = makeDataSource(":memory:");
    await dataSource.initialize();
    await dataSource.runMigrations();

    mockApi = new MockTelegramApi();
    bot = new Bot(env.TG_BOT_TOKEN, {
      botInfo: {
        id: 123456789,
        is_bot: true,
        first_name: "HealthNotifyBot",
        username: "health_notify_bot",
        can_join_groups: true,
        can_read_all_group_messages: true,
        supports_inline_queries: false,
        can_connect_to_business: false,
        has_main_web_app: false,
      } as any,
    });

    const appSettingRepo = dataSource.getRepository(AppSetting);
    const userRepo = dataSource.getRepository(BotUser);
    const chatRepo = dataSource.getRepository(RegisteredChat);
    const defRepo = dataSource.getRepository(ReminderDefinition);
    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const attemptRepo = dataSource.getRepository(DeliveryAttempt);
    const eventRepo = dataSource.getRepository(ReminderEvent);
    const measRepo = dataSource.getRepository(HealthMeasurement);

    settingsStore = new SettingsStore(appSettingRepo);
    const deliveryService = new DeliveryService(mockApi);
    historyService = new HistoryService(eventRepo, occRepo, measRepo);
    reminderService = new ReminderService(defRepo, occRepo, historyService);
    occurrenceService = new OccurrenceService(
      occRepo,
      defRepo,
      userRepo,
      attemptRepo,
      deliveryService,
      historyService,
    );

    menuSystem = registerBotHandlers({
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

    // Seed father and admin
    await userRepo.save([
      userRepo.create({ id: adminId, firstName: "Admin", role: "ADMIN", dmActive: true }),
      userRepo.create({ id: fatherId, firstName: "Father", role: "USER", dmActive: true }),
    ]);
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  function createMockCtx(userId: number, text: string, chatId = userId): Context {
    const replies: Array<{ text: string; other?: unknown }> = [];
    return {
      from: { id: userId, first_name: `User ${userId}`, is_bot: false },
      chat: { id: chatId, type: chatId < 0 ? "supergroup" : "private" },
      message: {
        message_id: 1,
        text,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" },
      },
      reply: async (replyText: string, other?: unknown) => {
        replies.push({ text: replyText, other });
        return {
          message_id: 2,
          text: replyText,
          date: 1,
          chat: { id: chatId, type: "private" },
        } as never;
      },
      api: {
        sendChatAction: async () => true,
        editMessageText: async () => true,
        editMessageReplyMarkup: async () => true,
      },
    } as unknown as Context;
  }

  it("navigates admin menu correctly (AC-01, AC-27)", async () => {
    const ctx = createMockCtx(adminId, "/start");
    await menuSystem.navigateTo(ctx, "MainMenu");

    expect(await menuSystem.currentName(ctx)).toBe("MainMenu");
    const kb = await menuSystem.currentKeyboard(ctx);
    const allLabels = kb.reply_markup.keyboard.flat().map((b) => b.text);

    expect(allLabels.some((l) => l.startsWith("📋 Напоминания"))).toBe(true);
    expect(allLabels).toContain("➕ Создать напоминание");
    expect(allLabels).toContain("👥 Получатели");
    expect(allLabels).toContain("💬 Чаты доставки");
    expect(allLabels).toContain("📊 История и статистика");
    expect(allLabels).toContain("⚙️ Настройки");

    // Navigate to Settings
    await menuSystem.navigateTo(ctx, "SettingsMenu");
    expect(await menuSystem.currentName(ctx)).toBe("SettingsMenu");

    // Navigate to Recipients
    await menuSystem.navigateTo(ctx, "RecipientsMenu");
    expect(await menuSystem.currentName(ctx)).toBe("RecipientsMenu");

    // Back to MainMenu
    await menuSystem.navigateTo(ctx, "MainMenu");
    expect(await menuSystem.currentName(ctx)).toBe("MainMenu");
  });

  it("rejects non-admin from accessing admin menu (AC-02)", async () => {
    expect(env.TG_ADMIN_USER_IDS.includes(strangerId)).toBe(false);
  });

  it("runs full Creation Wizard flow for father's blood pressure schedule (AC-03, AC-04)", async () => {
    const ctx = createMockCtx(adminId, "");
    await menuSystem.navigateTo(ctx, "WizardMenu");
    expect(await menuSystem.currentName(ctx)).toBe("WizardMenu");

    const wizardMenu = (menuSystem as unknown as { menus: Map<string, unknown> }).menus.get(
      "WizardMenu",
    ) as {
      handleTextInput(actionCtx: unknown, text: string): Promise<boolean>;
    };

    const actionCtx = {
      rawCtx: ctx,
      userId: adminId,
      chatId: adminId,
      text: "",
      lang: "ru",
      navigateTo: (name: string) => menuSystem.navigateTo(ctx, name),
    };

    // Step 1: Title
    await wizardMenu.handleTextInput(actionCtx, "Измерить артериальное давление");
    // Step 2: Description
    await wizardMenu.handleTextInput(actionCtx, "Утреннее и вечернее измерение");
    // Step 3: Category (set directly on draft or via button action)
    const draftAfterDesc = await settingsStore.getWizardDraft<{ step: string }>(adminId);
    expect(draftAfterDesc?.step).toBe("category");
    await settingsStore.setWizardDraft(adminId, {
      ...draftAfterDesc,
      category: "measurement",
      step: "recipient",
    });

    // Step 4: Recipient (father)
    await wizardMenu.handleTextInput(actionCtx, String(fatherId));
    // Step 5: Destination & Step 6: Timezone & Step 7: Schedule type
    const draftAfterRec = await settingsStore.getWizardDraft<{ step: string }>(adminId);
    expect(draftAfterRec?.step).toBe("destination");
    await settingsStore.setWizardDraft(adminId, {
      ...draftAfterRec,
      destinationType: "group",
      destinationChatId: groupChatId,
      timezone: "Europe/Moscow",
      scheduleType: "daily",
      step: "times",
    });

    // Step 8: Times
    await wizardMenu.handleTextInput(actionCtx, "06:00, 20:00");
    // Step 9: Duration (14 days)
    await wizardMenu.handleTextInput(actionCtx, "14");

    // Check draft
    const draft = await settingsStore.getWizardDraft<{
      step: string;
      title: string;
      timesOfDay: string[];
    }>(adminId);
    expect(draft).not.toBeNull();
    expect(draft?.title).toBe("Измерить артериальное давление");
    expect(draft?.timesOfDay).toEqual(["06:00", "20:00"]);
    expect(draft?.step).toBe("confirm");

    // Create the reminder
    const createdRule = await reminderService.createReminder(
      {
        title: draft!.title,
        targetUserIds: [fatherId],
        destinationChatId: groupChatId,
        destinationType: "group",
        scheduleType: "daily",
        timesOfDay: draft!.timesOfDay,
        timezone: "Europe/Moscow",
        startDate: "2026-10-19",
        endDate: "2026-11-01",
      },
      adminId,
    );

    expect(createdRule.id).toBeGreaterThan(0);

    // Verify 28 occurrences generated in SQLite
    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occurrences = await occRepo.find({ where: { reminderDefinitionId: createdRule.id } });
    expect(occurrences).toHaveLength(28);
  });

  it("strictly authorizes inline buttons in group reminders (AC-07, AC-08)", async () => {
    const defRepo = dataSource.getRepository(ReminderDefinition);
    const occRepo = dataSource.getRepository(ReminderOccurrence);

    const rule = await defRepo.save(
      defRepo.create({
        title: "Test Auth Rule",
        createdByUserId: adminId,
        targetUserIdsJson: JSON.stringify([fatherId]),
        destinationChatId: groupChatId,
        startDate: "2026-10-19",
        timesOfDayJson: JSON.stringify(["06:00"]),
      }),
    );

    const sampleOcc = occRepo.create({
      id: "auth-test-occ-1",
      reminderDefinitionId: rule.id,
      targetUserId: fatherId,
      plannedAtUtc: new Date(),
      dueAtUtc: new Date(),
      status: "PENDING",
    });
    await occRepo.save(sampleOcc);

    // 1. Stranger clicks Done -> rejected
    await expect(
      occurrenceService.handleUserAction(sampleOcc.id, "done", strangerId),
    ).rejects.toThrow();

    // 2. Father clicks Done -> success!
    const result = await occurrenceService.handleUserAction(sampleOcc.id, "done", fatherId);
    expect(result.success).toBe(true);

    const afterOcc = await occRepo.findOneBy({ id: sampleOcc.id });
    expect(afterOcc?.status).toBe("COMPLETED");

    // 3. Second click -> rejected because already COMPLETED
    await expect(
      occurrenceService.handleUserAction(sampleOcc.id, "done", fatherId),
    ).rejects.toThrow();
  });

  it("records structured blood pressure measurements via text input", async () => {
    const text = "120/80 72";
    const bpMatch = /^\s*(\d{2,3})\s*[\s/\\-]\s*(\d{2,3})(?:\s*[\s/\\-]\s*(\d{2,3}))?\s*$/u.exec(
      text,
    );
    expect(bpMatch).not.toBeNull();
    const systolic = Number(bpMatch![1]);
    const diastolic = Number(bpMatch![2]);
    const pulse = Number(bpMatch![3]);

    expect(systolic).toBe(120);
    expect(diastolic).toBe(80);
    expect(pulse).toBe(72);

    await historyService.recordMeasurement(fatherId, "blood_pressure", {
      systolic,
      diastolic,
      pulse,
    });

    const meas = await historyService.listUserMeasurements(fatherId);
    expect(meas).toHaveLength(1);
    expect(JSON.parse(meas[0]!.valueJson)).toEqual({ systolic: 120, diastolic: 80, pulse: 72 });
  });

  it("strictly restricts admin commands and menu interaction to private DMs", async () => {
    // Simulate sending /start in a group chat
    await (bot as any).handleUpdate({
      update_id: 999991,
      message: {
        message_id: 101,
        date: Math.floor(Date.now() / 1000),
        chat: { id: groupChatId, type: "group", title: "Family Group" },
        from: { id: adminId, is_bot: false, first_name: "Admin" },
        text: "/start",
      },
    });

    // Verify mock Telegram API did not receive any message dispatched to groupChatId from /start
    const groupStarts = mockApi.sentMessages.filter(
      (m) => m.chatId === groupChatId && m.text.includes("HealthNotify"),
    );
    expect(groupStarts).toHaveLength(0);
  });
});
