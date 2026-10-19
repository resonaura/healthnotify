import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repository } from "typeorm";
import type { AppEnv } from "../../src/config/env.js";
import { MainMenu } from "../../src/bot/menus/main.menu.js";
import { RemindersMenu } from "../../src/bot/menus/reminders.menu.js";
import { RecipientsMenu } from "../../src/bot/menus/recipients.menu.js";
import { ChatsMenu } from "../../src/bot/menus/chats.menu.js";
import { HistoryMenu } from "../../src/bot/menus/history.menu.js";
import { SettingsMenu } from "../../src/bot/menus/settings.menu.js";
import { WizardMenu, type WizardDraft } from "../../src/bot/menus/wizard.menu.js";
import type { MenuActionContext } from "../../src/bot/menu-system.js";
import type { ReminderService } from "../../src/services/reminder.service.js";
import type { HistoryService } from "../../src/services/history.service.js";
import type { BotUser } from "../../src/persistence/entities/bot-user.entity.js";
import type { RegisteredChat } from "../../src/persistence/entities/registered-chat.entity.js";
import { ReminderDefinition } from "../../src/persistence/entities/reminder-definition.entity.js";
import type { SettingsStore } from "../../src/persistence/settings.store.js";

describe("Menu UI Unit Tests", () => {
  let mockContext: MenuActionContext;
  let replies: string[];

  beforeEach(() => {
    replies = [];
    mockContext = {
      userId: 359079621,
      chatId: 359079621,
      lang: "ru",
      text: "",
      rawCtx: {
        reply: vi.fn(async (text: string) => {
          replies.push(text);
          return { message_id: 1 };
        }),
      } as any,
      navigateTo: vi.fn(),
    };
  });

  it("MainMenu initializes buttons, routes navigation, and handles /start greeting", async () => {
    const mockReminderService = {
      listReminders: vi.fn().mockResolvedValue([]),
    } as unknown as ReminderService;

    const menu = new MainMenu(mockReminderService);
    await menu.onInit(mockContext);

    expect(menu.buttons.length).toBeGreaterThan(0);

    // Click Reminders button
    await menu.buttons[0]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("RemindersMenu");

    // Click Create Reminder button
    await menu.buttons[1]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("WizardMenu");

    // Click Recipients button
    await menu.buttons[2]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("RecipientsMenu");

    // Click Chats button
    await menu.buttons[2]![1]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("ChatsMenu");

    // Click History button
    await menu.buttons[3]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("HistoryMenu");

    // Click Settings button
    await menu.buttons[4]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("SettingsMenu");

    // Click Language button
    await menu.buttons[4]![1]!.action!(mockContext);
    expect(mockContext.rawCtx.reply).toHaveBeenCalled();

    // On /start message
    mockContext.text = "/start";
    await menu.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("Привет! Я HealthNotify");
  });

  it("RemindersMenu renders empty state and list, toggles active/pause status", async () => {
    const activeDef = new ReminderDefinition();
    activeDef.id = 1;
    activeDef.title = "Blood Pressure";
    activeDef.activeStatus = "active";
    activeDef.timesOfDayJson = JSON.stringify(["06:00", "20:00"]);
    activeDef.startDate = "2026-10-19";
    activeDef.timezone = "Europe/Moscow";

    const mockReminderService = {
      listReminders: vi.fn().mockResolvedValue([activeDef]),
      pauseReminder: vi.fn().mockResolvedValue(true),
      resumeReminder: vi.fn().mockResolvedValue(true),
    } as unknown as ReminderService;

    const store = new Map<string, string>();
    const mockSettings = {
      get: vi.fn(async (key: string, fallback = "") => store.get(key) ?? fallback),
      set: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    } as unknown as SettingsStore;

    const menu = new RemindersMenu(mockReminderService, mockSettings);
    await menu.onInit(mockContext);

    // Click reminder card -> enters detail mode
    await menu.buttons[0]![0]!.action!(mockContext);
    expect(mockSettings.set).toHaveBeenCalledWith(`reminders_selected_${mockContext.userId}`, "1");

    // Toggle reminder (active -> pause) in detail view
    store.set(`reminders_selected_${mockContext.userId}`, "1");
    (mockReminderService.getReminder as any) = vi.fn().mockResolvedValue(activeDef);
    await menu.onInit(mockContext);
    await menu.buttons[0]![0]!.action!(mockContext);
    expect(mockReminderService.pauseReminder).toHaveBeenCalledWith(1, mockContext.userId);

    // On message renders reminder details
    await menu.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("Blood Pressure");

    // Empty list
    store.clear();
    (mockReminderService.listReminders as any).mockResolvedValue([]);
    await menu.onInit(mockContext);
    await menu.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("Напоминаний пока нет");
  });

  it("RemindersMenu handles interactive title and time editing via handleTextInput", async () => {
    const activeDef = new ReminderDefinition();
    activeDef.id = 1;
    activeDef.title = "Blood Pressure";
    activeDef.activeStatus = "active";
    activeDef.timesOfDayJson = JSON.stringify(["06:00", "20:00"]);
    activeDef.startDate = "2026-10-19";
    activeDef.timezone = "Europe/Moscow";

    const mockReminderService = {
      listReminders: vi.fn().mockResolvedValue([activeDef]),
      getReminder: vi.fn().mockResolvedValue(activeDef),
      updateReminder: vi.fn().mockResolvedValue(activeDef),
      deleteReminder: vi.fn().mockResolvedValue(true),
    } as unknown as ReminderService;

    const store = new Map<string, string>();
    const mockSettings = {
      get: vi.fn(async (key: string, fallback = "") => store.get(key) ?? fallback),
      set: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    } as unknown as SettingsStore;

    const menu = new RemindersMenu(mockReminderService, mockSettings);
    store.set(`reminders_selected_${mockContext.userId}`, "1");
    await menu.onInit(mockContext);

    // Click Edit Title button
    await menu.buttons[1]![0]!.action!(mockContext);
    expect(mockSettings.set).toHaveBeenCalledWith(
      `reminder_edit_${mockContext.userId}`,
      JSON.stringify({ id: 1, field: "title" }),
    );

    // Send new title
    const handledTitle = await menu.handleTextInput(mockContext, "New Blood Pressure Title");
    expect(handledTitle).toBe(true);
    expect(mockReminderService.updateReminder).toHaveBeenCalledWith(
      1,
      { title: "New Blood Pressure Title" },
      mockContext.userId,
    );

    // Set Edit Times
    store.set(`reminder_edit_${mockContext.userId}`, JSON.stringify({ id: 1, field: "times" }));
    const handledTimes = await menu.handleTextInput(mockContext, "07:00, 21:00");
    expect(handledTimes).toBe(true);
    expect(mockReminderService.updateReminder).toHaveBeenCalledWith(
      1,
      { timesOfDay: ["07:00", "21:00"] },
      mockContext.userId,
    );

    // Click Archive button
    await menu.buttons[2]![0]!.action!(mockContext);
    expect(mockReminderService.deleteReminder).toHaveBeenCalledWith(1, mockContext.userId);

    // Click Back button
    await menu.buttons[3]![0]!.action!(mockContext);
    expect(mockSettings.delete).toHaveBeenCalledWith(`reminders_selected_${mockContext.userId}`);
  });

  it("RecipientsMenu lists registered users and supports refresh and back navigation", async () => {
    const mockUserRepo = {
      find: vi.fn().mockResolvedValue([
        {
          id: 915156343,
          firstName: "Father",
          username: "father_user",
          role: "USER",
          dmActive: true,
        },
      ]),
    } as unknown as Repository<BotUser>;

    const menu = new RecipientsMenu(mockUserRepo);
    await menu.onInit(mockContext);

    // Click refresh
    await menu.buttons[0]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("RecipientsMenu");

    // Click back
    await menu.buttons[1]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("MainMenu");

    await menu.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("father_user");

    // Empty users
    (mockUserRepo.find as any).mockResolvedValue([]);
    await menu.onInit(mockContext);
    await menu.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("Пока нет зарегистрированных пользователей");
  });

  it("ChatsMenu lists connected chats and default family group", async () => {
    const mockChatRepo = {
      find: vi.fn().mockResolvedValue([
        { id: -1004301185075, title: "Family Group", chatType: "group" },
        { id: -1009999999999, title: "Other Group", chatType: "supergroup" },
      ]),
    } as unknown as Repository<RegisteredChat>;

    const menu = new ChatsMenu(mockChatRepo, -1004301185075);
    await menu.onInit(mockContext);
    await menu.onMessage(mockContext);

    expect(replies[replies.length - 1]).toContain("Основная семейная группа");
    expect(replies[replies.length - 1]).toContain("Other Group");
  });

  it("HistoryMenu renders compliance stats and handles empty state", async () => {
    const mockHistoryService = {
      getComplianceStats: vi.fn().mockResolvedValue({
        totalOccurrences: 10,
        completed: 8,
        skipped: 1,
        missed: 1,
        snoozes: 3,
        completionRate: 80,
      }),
    } as unknown as HistoryService;

    const menu = new HistoryMenu(mockHistoryService);
    await menu.onInit(mockContext);
    await menu.onMessage(mockContext);

    expect(replies[replies.length - 1]).toContain("80%");

    // Empty stats
    (mockHistoryService.getComplianceStats as any).mockResolvedValue(null);
    await menu.onInit(mockContext);
    await menu.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("записей пока нет");
  });

  it("SettingsMenu displays configured environment and routes navigation", async () => {
    const mockEnv: AppEnv = {
      TG_BOT_TOKEN: "1234567890:AAFakeMockTokenForTestingPurposes00000",
      TG_ADMIN_USER_IDS: [359079621, 261171441],
      DEFAULT_GROUP_CHAT_ID: -1004301185075,
      DEFAULT_RECIPIENT_USER_ID: 915156343,
      DEFAULT_TIMEZONE: "America/Vancouver",
      DATABASE_FILE: ":memory:",
      DEFAULT_LOCALE: "ru",
      SCHEDULER_INTERVAL_SECONDS: 10,
      CATCH_UP_WINDOW_MINUTES: 60,
      DEFAULT_SNOOZE_INTERVALS: [5, 10, 20, 40, 60],
      DEFAULT_AUTO_REPEAT_INTERVALS: [5, 10, 20, 40],
      MAX_SNOOZE_COUNT: 5,
      MAX_AUTO_REPEAT_COUNT: 4,
    };

    const mockSettings = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as SettingsStore;

    const menu = new SettingsMenu(mockEnv, mockSettings);
    await menu.onInit(mockContext);

    // Language button
    await menu.buttons[0]![0]!.action!(mockContext);
    expect(mockContext.rawCtx.reply).toHaveBeenCalled();

    // Snooze cycle button
    await menu.buttons[1]![0]!.action!(mockContext);
    expect(mockSettings.set).toHaveBeenCalled();

    // Repeat cycle button
    await menu.buttons[1]![1]!.action!(mockContext);
    expect(mockSettings.set).toHaveBeenCalled();

    // Back to main
    await menu.buttons[2]![0]!.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("MainMenu");

    await menu.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("America/Vancouver");
  });

  it("WizardMenu walks through creation steps, handles inputs, and saves reminder", async () => {
    const store = new Map<string, string>();
    const mockSettings = {
      get: vi.fn(async (key: string, fallback = "") => store.get(key) ?? fallback),
      set: vi.fn(async (key: string, val: string) => {
        store.set(key, val);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      getWizardDraft: vi.fn(async <T = WizardDraft>(userId: number): Promise<T | null> => {
        const raw = store.get(`wizard_draft_${userId}`);
        return raw ? (JSON.parse(raw) as T) : null;
      }),
      setWizardDraft: vi.fn(async (userId: number, draft: unknown) => {
        store.set(`wizard_draft_${userId}`, JSON.stringify(draft));
      }),
      clearWizardDraft: vi.fn(async (userId: number) => {
        store.delete(`wizard_draft_${userId}`);
      }),
    } as unknown as SettingsStore;

    const mockReminderService = {
      createReminder: vi.fn().mockResolvedValue({ id: 42 }),
    } as unknown as ReminderService;

    const mockChatRepo = {
      find: vi
        .fn()
        .mockResolvedValue([{ id: -100999999, title: "Custom Group", createdAt: new Date() }]),
    } as unknown as Repository<RegisteredChat>;

    const mockUserRepo = {
      find: vi
        .fn()
        .mockResolvedValue([
          { id: 915156343, firstName: "Alex", lastName: "Smith", username: "alexsmith" },
        ]),
      findOneBy: vi.fn().mockResolvedValue({
        id: 915156343,
        firstName: "Alex",
        lastName: "Smith",
        username: "alexsmith",
      }),
      create: vi.fn((data: unknown) => data),
      save: vi.fn(),
    } as unknown as Repository<BotUser>;

    const wizard = new WizardMenu(
      mockSettings,
      mockReminderService,
      mockUserRepo,
      mockChatRepo,
      915156343,
      -1004301185075,
      "America/Vancouver",
    );

    // Initial state: Step title
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("Шаг 1 из 10");

    // Title input
    await wizard.handleTextInput(mockContext, "Измерить давление");
    let draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.step).toBe("description");

    // Description input
    await wizard.handleTextInput(mockContext, "Утром и вечером");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.step).toBe("category");

    // Category button click
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    expect(wizard.buttons.length).toBeGreaterThan(0);
    // Click 'measurement' button (first row, first button)
    await wizard.buttons[0]![0]!.action!(mockContext);
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.step).toBe("recipient");

    // Recipient step: test buttons render and multi-id text input
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    // Button label should contain Alex Smith, NEVER "Отец"
    expect(wizard.buttons.flat().some((b) => b.text.includes("Alex Smith"))).toBe(true);
    expect(wizard.buttons.flat().some((b) => b.text.includes("Отец"))).toBe(false);

    await wizard.handleTextInput(mockContext, "915156343, 359079621");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.step).toBe("destination");
    expect(draft?.targetUserIds).toEqual([915156343, 359079621]);

    // Destination step: choose DM to each
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    await wizard.buttons[0]![0]!.action!(mockContext); // DM
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.step).toBe("timezone");

    // Timezone step: choose default timezone
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    await wizard.buttons[0]![0]!.action!(mockContext); // default timezone
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.step).toBe("schedule_type");

    // Schedule type step: test interval buttons and natural text input
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    // Test text input for interval
    await wizard.handleTextInput(mockContext, "раз в 3 дня");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.scheduleType).toBe("interval");
    expect(draft?.daysOfWeek).toEqual([3]);
    expect(draft?.step).toBe("times");

    // Test text input schedule types branches
    draft.step = "schedule_type";
    await mockSettings.setWizardDraft(mockContext.userId, draft);
    await wizard.handleTextInput(mockContext, "будни");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.scheduleType).toBe("weekdays");

    draft.step = "schedule_type";
    await mockSettings.setWizardDraft(mockContext.userId, draft);
    await wizard.handleTextInput(mockContext, "через день");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.scheduleType).toBe("interval");
    expect(draft?.daysOfWeek).toEqual([2]);

    draft.step = "schedule_type";
    await mockSettings.setWizardDraft(mockContext.userId, draft);
    await wizard.handleTextInput(mockContext, "еженедельно");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.scheduleType).toBe("interval");
    expect(draft?.daysOfWeek).toEqual([7]);

    draft.step = "schedule_type";
    await mockSettings.setWizardDraft(mockContext.userId, draft);
    await wizard.handleTextInput(mockContext, "однократно");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.scheduleType).toBe("once");

    draft.step = "schedule_type";
    await mockSettings.setWizardDraft(mockContext.userId, draft);
    await wizard.handleTextInput(mockContext, "каждый день");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.scheduleType).toBe("daily");

    // Times step: test natural language parser input
    draft.step = "times";
    await mockSettings.setWizardDraft(mockContext.userId, draft);
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    // Invalid time test
    await wizard.handleTextInput(mockContext, "непонятное время");
    expect(replies[replies.length - 1]).toContain("Не удалось распознать");

    // Valid time input
    await wizard.handleTextInput(mockContext, "В 6 утра и 8 вечера");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.timesOfDay).toEqual(["06:00", "20:00"]);
    expect(draft?.step).toBe("duration");

    // Duration step: test indefinite text
    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    await wizard.handleTextInput(mockContext, "14 дней");
    draft = (await mockSettings.getWizardDraft<WizardDraft>(mockContext.userId))!;
    expect(draft?.endDate).toBeTruthy();
    expect(draft?.step).toBe("confirm");

    // Confirm step: renders preview and confirms
    draft.scheduleType = "interval";
    draft.daysOfWeek = [2];
    await mockSettings.setWizardDraft(mockContext.userId, draft);

    await wizard.onInit(mockContext);
    await wizard.onMessage(mockContext);
    expect(replies[replies.length - 1]).toContain("Проверьте параметры");
    expect(replies[replies.length - 1]).toContain("Раз в 2 дня (через день)");

    // English render preview test
    const enContext = { ...mockContext, lang: "en" as const };
    await wizard.onInit(enContext);
    await wizard.onMessage(enContext);
    expect(replies[replies.length - 1]).toContain("Review your new reminder");

    // Click confirm button
    await wizard.buttons[0]![0]!.action!(mockContext);
    expect(mockReminderService.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Измерить давление",
        category: "measurement",
        targetUserIds: [915156343, 359079621],
        scheduleType: "interval",
        timesOfDay: ["06:00", "20:00"],
      }),
      mockContext.userId,
    );
    expect(mockContext.navigateTo).toHaveBeenCalledWith("RemindersMenu");

    // Test cancel button
    await mockSettings.setWizardDraft(mockContext.userId, { step: "title" });
    await wizard.onInit(mockContext);
    const cancelBtn = wizard.buttons[wizard.buttons.length - 1]![0]!;
    await cancelBtn.action!(mockContext);
    expect(mockContext.navigateTo).toHaveBeenCalledWith("MainMenu");
  });
});
