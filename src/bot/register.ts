import type { Bot } from "grammy";
import type { Repository } from "typeorm";
import type { AppEnv } from "../config/env.js";
import { isAdmin } from "../config/env.js";
import type { Locale } from "../i18n/index.js";
import { t } from "../i18n/index.js";
import type { BotUser } from "../persistence/entities/bot-user.entity.js";
import type { RegisteredChat } from "../persistence/entities/registered-chat.entity.js";
import type { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";
import type { SettingsStore } from "../persistence/settings.store.js";
import type { HistoryService } from "../services/history.service.js";
import type { OccurrenceService } from "../services/occurrence.service.js";
import type { ReminderService } from "../services/reminder.service.js";
import { logger } from "../shared/logger.js";
import { MenuSystem } from "./menu-system.js";
import { ChatsMenu } from "./menus/chats.menu.js";
import { HistoryMenu } from "./menus/history.menu.js";
import { MainMenu } from "./menus/main.menu.js";
import { RecipientsMenu } from "./menus/recipients.menu.js";
import { DeliveryService } from "../services/delivery.service.js";
import { RemindersMenu } from "./menus/reminders.menu.js";
import { SettingsMenu } from "./menus/settings.menu.js";
import { WizardMenu } from "./menus/wizard.menu.js";

const BP_REGEX = /^\s*(\d{2,3})\s*[\s/\\-]\s*(\d{2,3})(?:\s*[\s/\\-]\s*(\d{2,3}))?\s*$/u;

export interface RegisterBotOptions {
  bot: Bot;
  env: AppEnv;
  settings: SettingsStore;
  reminderService: ReminderService;
  occurrenceService: OccurrenceService;
  historyService: HistoryService;
  deliveryService?: DeliveryService;
  userRepo: Repository<BotUser>;
  chatRepo: Repository<RegisteredChat>;
  occRepo: Repository<ReminderOccurrence>;
}

export function registerBotHandlers(options: RegisterBotOptions): MenuSystem {
  const {
    bot,
    env,
    settings,
    reminderService,
    occurrenceService,
    historyService,
    userRepo,
    chatRepo,
    occRepo,
  } = options;

  // Initialize Menu System
  const adminMenuSystem = new MenuSystem(settings, {
    rootMenuName: "MainMenu",
    navigationPrefix: "menu_nav",
  });

  const mainMenu = new MainMenu(reminderService);
  const remindersMenu = new RemindersMenu(reminderService, settings);
  const recipientsMenu = new RecipientsMenu(userRepo);
  const chatsMenu = new ChatsMenu(chatRepo, env.DEFAULT_GROUP_CHAT_ID);
  const historyMenu = new HistoryMenu(historyService);
  const settingsMenu = new SettingsMenu(env, settings);
  const delivery = options.deliveryService ?? new DeliveryService(bot.api);
  const wizardMenu = new WizardMenu(
    settings,
    reminderService,
    userRepo,
    chatRepo,
    env.DEFAULT_RECIPIENT_USER_ID,
    env.DEFAULT_GROUP_CHAT_ID,
    env.DEFAULT_TIMEZONE,
    delivery,
  );

  adminMenuSystem.registerMenu(mainMenu);
  adminMenuSystem.registerMenu(remindersMenu);
  adminMenuSystem.registerMenu(recipientsMenu);
  adminMenuSystem.registerMenu(chatsMenu);
  adminMenuSystem.registerMenu(historyMenu);
  adminMenuSystem.registerMenu(settingsMenu);
  adminMenuSystem.registerMenu(wizardMenu);

  // 1. Typing animation middleware in DM
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type !== "private") {
      await next();
      return;
    }
    const chatId = ctx.chat.id;
    let finished = false;
    let timer: NodeJS.Timeout | null = null;

    const sendTyping = (): void => {
      if (finished) return;
      void ctx.api
        .sendChatAction(chatId, "typing")
        .catch(() => undefined)
        .finally(() => {
          if (!finished) timer = setTimeout(sendTyping, 4000);
        });
    };

    timer = setTimeout(sendTyping, 400);
    try {
      await next();
    } finally {
      finished = true;
      if (timer) clearTimeout(timer);
    }
  });

  // 2. User onboarding and tracking middleware
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      const from = ctx.from;
      const existing = await userRepo.findOneBy({ id: from.id });
      const isDm = ctx.chat?.type === "private";

      if (!existing) {
        const newUser = userRepo.create({
          id: from.id,
          username: from.username ?? null,
          firstName: from.first_name,
          lastName: from.last_name ?? null,
          role: isAdmin(from.id, env) ? "ADMIN" : "USER",
          dmActive: isDm,
          language: "ru",
          dataConsent: true,
        });
        await userRepo.save(newUser);
        logger.info(`Registered new user ${from.id} (${from.first_name})`);
      } else {
        let updated = false;
        if (from.first_name && existing.firstName !== from.first_name) {
          existing.firstName = from.first_name;
          updated = true;
        }
        if (existing.lastName !== (from.last_name ?? null)) {
          existing.lastName = from.last_name ?? null;
          updated = true;
        }
        if (existing.username !== (from.username ?? null)) {
          existing.username = from.username ?? null;
          updated = true;
        }
        if (isDm && !existing.dmActive) {
          existing.dmActive = true;
          updated = true;
        }
        if (updated) {
          await userRepo.save(existing);
        }
      }
    }

    // Auto-register connected groups
    if (ctx.chat && (ctx.chat.type === "group" || ctx.chat.type === "supergroup")) {
      const existingChat = await chatRepo.findOneBy({ id: ctx.chat.id });
      if (!existingChat) {
        const title = "title" in ctx.chat ? ctx.chat.title : "Group Chat";
        const newChat = chatRepo.create({
          id: ctx.chat.id,
          title,
          chatType: ctx.chat.type,
          addedByUserId: ctx.from?.id ?? 0,
          isActive: true,
        });
        await chatRepo.save(newChat);
        logger.info(`Auto-registered group chat ${ctx.chat.id} (${title})`);
      }
    }

    await next();
  });

  // 3. Language selection callback query
  bot.callbackQuery(/^lang:set:(ru|en)$/u, async (ctx) => {
    const lang = ctx.match[1] as Locale;
    const userId = ctx.from.id;

    await settings.setUserLanguage(userId, lang);
    await ctx.answerCallbackQuery({
      text: t(lang, lang === "ru" ? "lang_selected_ru" : "lang_selected_en"),
    });

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch {
      // Ignored
    }

    if (isAdmin(userId, env)) {
      await adminMenuSystem.navigateTo(ctx, "MainMenu");
    } else {
      await ctx.reply(t(lang, lang === "ru" ? "lang_selected_ru" : "lang_selected_en"));
    }
  });

  // 4. Action button callback query [✅ Done], [🕒 Later], [❌ Skip]
  bot.callbackQuery(/^act:([dsk]):([a-f0-9-]+)$/iu, async (ctx) => {
    const actionKey = ctx.match[1]?.toLowerCase();
    const occurrenceId = ctx.match[2]!;
    const fromId = ctx.from.id;

    const user = await userRepo.findOneBy({ id: fromId });
    const lang = (user?.language === "en" ? "en" : "ru") as Locale;

    const occ = await occRepo.findOneBy({ id: occurrenceId });
    if (!occ) {
      await ctx.answerCallbackQuery({
        text: lang === "en" ? "⚠️ Reminder not found." : "⚠️ Напоминание не найдено.",
        show_alert: true,
      });
      return;
    }

    // Strict Authorization check: only targeted user can click
    if (fromId !== occ.targetUserId) {
      await ctx.answerCallbackQuery({
        text: t(lang, "error_not_your_reminder"),
        show_alert: true,
      });

      await historyService.logEvent(
        occurrenceId,
        occ.reminderDefinitionId,
        occ.targetUserId,
        fromId,
        "unauthorized_click",
        { clickedAction: actionKey },
      );

      logger.warn(
        `Unauthorized click on occurrence ${occurrenceId}: from user ${fromId}, expected ${occ.targetUserId}`,
      );
      return;
    }

    const actionMap: Record<string, "done" | "snooze" | "skip"> = {
      d: "done",
      s: "snooze",
      k: "skip",
    };

    const action = actionMap[actionKey ?? "d"] ?? "done";

    try {
      const messageId = ctx.callbackQuery.message?.message_id;
      const chatId = ctx.callbackQuery.message?.chat.id;
      const result = await occurrenceService.handleUserAction(
        occurrenceId,
        action,
        fromId,
        new Date(),
        messageId,
        chatId,
      );
      await ctx.answerCallbackQuery({ text: result.message, show_alert: false });

      // If Done and in DM, offer blood pressure recording prompt
      if (action === "done" && ctx.chat?.type === "private") {
        await ctx.reply(t(lang, "bp_measurement_prompt"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.answerCallbackQuery({ text: msg, show_alert: true });
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      } catch {
        // Ignored if Telegram rate limits or cannot edit
      }
    }
  });

  // 5. Admin command handlers
  bot.command("start", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    const userId = ctx.from?.id;
    if (!userId) return;

    if (isAdmin(userId, env)) {
      await adminMenuSystem.navigateTo(ctx, "MainMenu", "/start");
    } else {
      const user = await userRepo.findOneBy({ id: userId });
      const lang = (user?.language === "en" ? "en" : "ru") as Locale;
      await ctx.reply(
        lang === "en"
          ? "👋 Hello! You are registered in HealthNotify. You will receive scheduled health reminders here."
          : "👋 Здравствуйте! Вы зарегистрированы в HealthNotify. Сюда будут приходить ваши персональные напоминания о здоровье.",
      );
    }
  });

  bot.command("menu", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    if (!ctx.from || !isAdmin(ctx.from.id, env)) return;
    await adminMenuSystem.navigateTo(ctx, "MainMenu");
  });

  bot.command("help", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    if (!ctx.from || !isAdmin(ctx.from.id, env)) return;
    await adminMenuSystem.showCurrent(ctx, "/help");
  });

  bot.command("cancel", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    if (!ctx.from || !isAdmin(ctx.from.id, env)) return;
    await settings.clearWizardDraft(ctx.from.id);
    const user = await userRepo.findOneBy({ id: ctx.from.id });
    const lang = (user?.language === "en" ? "en" : "ru") as Locale;
    await ctx.reply(lang === "en" ? "Action cancelled." : "Действие отменено.");
    await adminMenuSystem.navigateTo(ctx, "MainMenu");
  });

  // 6. Incoming text handler (private DM only)
  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;

    // Check if this is a blood pressure reading input (e.g. 120/80 70)
    const bpMatch = BP_REGEX.exec(text);
    if (bpMatch) {
      const systolic = Number(bpMatch[1]);
      const diastolic = Number(bpMatch[2]);
      const pulse = bpMatch[3] ? Number(bpMatch[3]) : null;

      if (
        systolic >= 50 &&
        systolic <= 250 &&
        diastolic >= 30 &&
        diastolic <= 150 &&
        (pulse === null || (pulse >= 30 && pulse <= 220))
      ) {
        await historyService.recordMeasurement(userId, "blood_pressure", {
          systolic,
          diastolic,
          pulse: pulse ?? undefined,
        });

        const user = await userRepo.findOneBy({ id: userId });
        const lang = (user?.language === "en" ? "en" : "ru") as Locale;

        await ctx.reply(
          t(lang, "bp_measurement_saved", {
            systolic,
            diastolic,
            pulse: pulse ?? "—",
          }),
        );
        return;
      }
    }

    // Only Admins can navigate menus or fill wizard
    if (!isAdmin(userId, env)) {
      return;
    }

    // Check menu buttons
    if (await adminMenuSystem.handleButton(ctx, text)) {
      return;
    }

    // Check if currently inside WizardMenu or RemindersMenu
    const currentMenu = await adminMenuSystem.currentName(ctx);
    if (currentMenu === "WizardMenu") {
      const handled = await wizardMenu.handleTextInput(
        {
          rawCtx: ctx,
          userId,
          chatId: ctx.chat.id,
          text,
          lang: await adminMenuSystem.userLang(userId),
          navigateTo: (name, nextText) => adminMenuSystem.navigateTo(ctx, name, nextText),
        },
        text,
      );
      if (handled) return;
    }

    if (currentMenu === "RemindersMenu") {
      const handled = await remindersMenu.handleTextInput(
        {
          rawCtx: ctx,
          userId,
          chatId: ctx.chat.id,
          text,
          lang: await adminMenuSystem.userLang(userId),
          navigateTo: (name, nextText) => adminMenuSystem.navigateTo(ctx, name, nextText),
        },
        text,
      );
      if (handled) return;
    }

    // Fallback message for unhandled text
    await adminMenuSystem.showCurrent(ctx, text);
  });

  return adminMenuSystem;
}
