import type { Repository } from "typeorm";
import type { Locale } from "../../i18n/index.js";
import { t } from "../../i18n/index.js";
import type { BotUser } from "../../persistence/entities/bot-user.entity.js";
import type { RegisteredChat } from "../../persistence/entities/registered-chat.entity.js";
import type {
  ReminderCategory,
  ScheduleType,
} from "../../persistence/entities/reminder-definition.entity.js";
import type { SettingsStore } from "../../persistence/settings.store.js";
import {
  type DeliveryService,
  getUserDisplayName,
  isOtetsIvanovich,
} from "../../services/delivery.service.js";
import type { ReminderService } from "../../services/reminder.service.js";
import { addDaysToDate, getTodayDateInZone, parseTimesInput } from "../../shared/time.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export type WizardStep =
  | "title"
  | "description"
  | "category"
  | "recipient"
  | "destination"
  | "timezone"
  | "schedule_type"
  | "times"
  | "duration"
  | "confirm";

export interface WizardDraft {
  step: WizardStep;
  title?: string;
  description?: string | null;
  category?: ReminderCategory;
  targetUserIds?: number[];
  destinationChatId?: number;
  destinationType?: "dm" | "group";
  timezone?: string;
  scheduleType?: ScheduleType;
  timesOfDay?: string[];
  daysOfWeek?: number[] | null;
  startDate?: string;
  endDate?: string | null;
}

export class WizardMenu extends Menu {
  public readonly name = "WizardMenu";

  constructor(
    private readonly settings: SettingsStore,
    private readonly reminderService: ReminderService,
    private readonly userRepo: Repository<BotUser>,
    private readonly chatRepo: Repository<RegisteredChat>,
    private readonly defaultRecipientId: number | null = null,
    private readonly defaultGroupId: number | null = null,
    private readonly defaultTimezone: string = "America/Vancouver",
    private readonly deliveryService?: DeliveryService,
  ) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    this.buttons = [];

    const cancelBtn = new Button(t(ctx.lang, "btn_cancel"), async (actionCtx) => {
      await this.settings.clearWizardDraft(actionCtx.userId);
      await actionCtx.rawCtx.reply(t(actionCtx.lang, "wizard_cancelled"));
      await actionCtx.navigateTo("MainMenu");
    });

    if (draft.step === "title") {
      this.buttons = [
        [
          new Button(
            ctx.lang === "en" ? "🩺 Measure Blood Pressure" : "🩺 Измерить артериальное давление",
            (act) =>
              this.handleTitle(
                act,
                ctx.lang === "en" ? "Measure Blood Pressure" : "Измерить артериальное давление",
              ),
          ),
          new Button(ctx.lang === "en" ? "💊 Take Medication" : "💊 Принять лекарство", (act) =>
            this.handleTitle(act, ctx.lang === "en" ? "Take Medication" : "Принять лекарство"),
          ),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "description") {
      this.buttons = [
        [
          new Button(
            ctx.lang === "en" ? "Skip description (-)" : "Пропустить описание (-)",
            (act) => this.handleDescription(act, "-"),
          ),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "category") {
      this.buttons = [
        [
          new Button(ctx.lang === "en" ? "🩺 Measurements" : "🩺 Измерения", (act) =>
            this.handleCategory(act, "measurement"),
          ),
          new Button(ctx.lang === "en" ? "💊 Medication" : "💊 Лекарства", (act) =>
            this.handleCategory(act, "medication"),
          ),
        ],
        [
          new Button(ctx.lang === "en" ? "🏥 Procedure" : "🏥 Процедура", (act) =>
            this.handleCategory(act, "procedure"),
          ),
          new Button(ctx.lang === "en" ? "🏃 Exercise" : "🏃 Упражнения", (act) =>
            this.handleCategory(act, "exercise"),
          ),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "recipient") {
      const registered = await this.userRepo.find({ order: { updatedAt: "DESC" }, take: 10 });
      let defaultUser: BotUser | undefined = registered.find(
        (u) => u.id === this.defaultRecipientId,
      );

      if (!defaultUser && this.defaultRecipientId) {
        defaultUser = (await this.userRepo.findOneBy({ id: this.defaultRecipientId })) ?? undefined;
        if (!defaultUser && this.deliveryService) {
          const chats = await this.chatRepo.find({ where: { isActive: true }, take: 5 });
          let resolvedProfile: {
            firstName: string;
            lastName: string | null;
            username: string | null;
          } | null = null;
          for (const c of chats) {
            resolvedProfile = await this.deliveryService.fetchUserProfile(
              this.defaultRecipientId,
              c.id,
            );
            if (resolvedProfile) break;
          }
          if (resolvedProfile) {
            defaultUser = this.userRepo.create({
              id: this.defaultRecipientId,
              firstName: resolvedProfile.firstName,
              lastName: resolvedProfile.lastName,
              username: resolvedProfile.username,
              role: "USER",
              dmActive: false,
              language: "ru",
              dataConsent: true,
            });
            await this.userRepo.save(defaultUser);
          }
        }
      }

      const allCandidates: BotUser[] = [...registered];
      if (defaultUser && !allCandidates.some((u) => u.id === defaultUser!.id)) {
        allCandidates.push(defaultUser);
      }

      const rows: Button[][] = [];
      const userButtons: Button[] = [];

      userButtons.push(
        new Button(t(ctx.lang, "btn_myself"), (act) => this.handleRecipient(act, [act.userId])),
      );

      const otherUsers = allCandidates.filter((u) => u.id !== ctx.userId);
      for (const u of otherUsers) {
        const displayName = getUserDisplayName(u);
        userButtons.push(
          new Button(`👤 ${displayName}`, (act) => this.handleRecipient(act, [u.id])),
        );
      }

      for (let i = 0; i < userButtons.length; i += 2) {
        rows.push(userButtons.slice(i, i + 2));
      }

      if (otherUsers.length === 1) {
        const singleOther = otherUsers[0]!;
        const otherName = getUserDisplayName(singleOther);
        rows.push([
          new Button(t(ctx.lang, "btn_both_recipient_and_me", { name: otherName }), (act) =>
            this.handleRecipient(act, [singleOther.id, act.userId]),
          ),
        ]);
      } else if (otherUsers.length > 1) {
        const allTargetIds = Array.from(new Set([ctx.userId, ...otherUsers.map((u) => u.id)]));
        rows.push([
          new Button(t(ctx.lang, "btn_all_recipients", { count: allTargetIds.length }), (act) =>
            this.handleRecipient(act, allTargetIds),
          ),
        ]);
      }

      rows.push([cancelBtn]);
      this.buttons = rows;
    } else if (draft.step === "destination") {
      const rows: Button[][] = [];
      rows.push([
        new Button(t(ctx.lang, "btn_to_dm_each"), (act) => this.handleDestination(act, "dm", 0)),
      ]);

      const groupRow: Button[] = [];
      if (this.defaultGroupId) {
        groupRow.push(
          new Button(ctx.lang === "en" ? "👨‍👩‍👧 Family Group" : "👨‍👩‍👧 Семейная группа", (act) =>
            this.handleDestination(act, "group", this.defaultGroupId!),
          ),
        );
      }

      const chats = await this.chatRepo.find({ order: { createdAt: "DESC" }, take: 4 });
      for (const chat of chats) {
        if (chat.id !== this.defaultGroupId) {
          groupRow.push(
            new Button(`💬 ${chat.title}`, (act) => this.handleDestination(act, "group", chat.id)),
          );
        }
      }

      if (groupRow.length > 0) {
        rows.push(groupRow.slice(0, 2));
      }
      rows.push([cancelBtn]);
      this.buttons = rows;
    } else if (draft.step === "timezone") {
      this.buttons = [
        [
          new Button(`🌍 ${this.defaultTimezone}`, (act) =>
            this.handleTimezone(act, this.defaultTimezone),
          ),
        ],
        [new Button("UTC", (act) => this.handleTimezone(act, "UTC"))],
        [cancelBtn],
      ];
    } else if (draft.step === "schedule_type") {
      this.buttons = [
        [
          new Button(ctx.lang === "en" ? "📅 Daily (Every day)" : "📅 Каждый день", (act) =>
            this.handleScheduleType(act, "daily"),
          ),
        ],
        [
          new Button(ctx.lang === "en" ? "💼 Weekdays (Mon-Fri)" : "💼 По будням (Пн-Пт)", (act) =>
            this.handleScheduleType(act, "weekdays"),
          ),
        ],
        [
          new Button(
            ctx.lang === "en" ? "🔄 Every 2 days (alt. days)" : "🔄 Раз в 2 дня (через день)",
            (act) => this.handleScheduleType(act, "interval", 2),
          ),
          new Button(ctx.lang === "en" ? "🔄 Every 3 days" : "🔄 Раз в 3 дня", (act) =>
            this.handleScheduleType(act, "interval", 3),
          ),
        ],
        [
          new Button(ctx.lang === "en" ? "📆 Weekly (Once a week)" : "📆 Раз в неделю", (act) =>
            this.handleScheduleType(act, "interval", 7),
          ),
          new Button(ctx.lang === "en" ? "🎯 Once" : "🎯 Однократно", (act) =>
            this.handleScheduleType(act, "once"),
          ),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "times") {
      this.buttons = [
        [
          new Button(
            ctx.lang === "en"
              ? "🌅 06:00, 20:00 (morning & evening)"
              : "🌅 06:00, 20:00 (6 утра и 8 вечера)",
            (act) => this.handleTimes(act, "06:00, 20:00"),
          ),
        ],
        [
          new Button(
            ctx.lang === "en"
              ? "💊 08:00, 14:00, 20:00 (3x/day)"
              : "💊 08:00, 14:00, 20:00 (3 раза в день)",
            (act) => this.handleTimes(act, "08:00, 14:00, 20:00"),
          ),
        ],
        [
          new Button(ctx.lang === "en" ? "☀️ 09:00 (1x/day)" : "☀️ 09:00 (1 раз в день)", (act) =>
            this.handleTimes(act, "09:00"),
          ),
          new Button(
            ctx.lang === "en" ? "⏱ Every 4h (08,12,16,20)" : "⏱ Каждые 4ч (08,12,16,20)",
            (act) => this.handleTimes(act, "08:00, 12:00, 16:00, 20:00"),
          ),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "duration") {
      this.buttons = [
        [
          new Button(ctx.lang === "en" ? "14 days (2 weeks)" : "14 дней (2 недели)", (act) =>
            this.handleDuration(act, "14"),
          ),
        ],
        [
          new Button(ctx.lang === "en" ? "7 days (1 week)" : "7 дней (1 неделя)", (act) =>
            this.handleDuration(act, "7"),
          ),
        ],
        [
          new Button(ctx.lang === "en" ? "30 days (1 month)" : "30 дней (месяц)", (act) =>
            this.handleDuration(act, "30"),
          ),
        ],
        [
          new Button(ctx.lang === "en" ? "Indefinite" : "Бессрочно", (act) =>
            this.handleDuration(act, "forever"),
          ),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "confirm") {
      this.buttons = [
        [new Button(t(ctx.lang, "btn_confirm"), (act) => this.handleConfirm(act))],
        [cancelBtn],
      ];
    }
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);

    if (draft.step === "title") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_title"), this.getKeyboard());
    } else if (draft.step === "description") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_description"), this.getKeyboard());
    } else if (draft.step === "category") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_category"), this.getKeyboard());
    } else if (draft.step === "recipient") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_recipients"), this.getKeyboard());
    } else if (draft.step === "destination") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_destination"), this.getKeyboard());
    } else if (draft.step === "timezone") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_timezone"), this.getKeyboard());
    } else if (draft.step === "schedule_type") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_schedule_type"), this.getKeyboard());
    } else if (draft.step === "times") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_times"), this.getKeyboard());
    } else if (draft.step === "duration") {
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_duration"), this.getKeyboard());
    } else if (draft.step === "confirm") {
      const users = await this.userRepo.find({ take: 20 });
      const usersMap = new Map(users.map((u) => [u.id, u]));
      const previewText = this.renderPreview(draft, ctx.lang, usersMap);
      await ctx.rawCtx.reply(t(ctx.lang, "wizard_step_preview", { previewText }), {
        ...this.getKeyboard(),
        parse_mode: "Markdown",
      });
    }
  }

  public async handleTextInput(ctx: MenuActionContext, text: string): Promise<boolean> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    const trimmed = text.trim();

    if (draft.step === "title") {
      await this.handleTitle(ctx, trimmed);
      return true;
    }
    if (draft.step === "description") {
      await this.handleDescription(ctx, trimmed);
      return true;
    }
    if (draft.step === "recipient") {
      const ids = trimmed
        .split(/[\s,]+/u)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length > 0) {
        await this.handleRecipient(ctx, ids);
        return true;
      }
    }
    if (draft.step === "destination") {
      const parsed = Number(trimmed.replace(/[^\d-]/gu, ""));
      if (parsed !== 0) {
        await this.handleDestination(ctx, "group", parsed);
        return true;
      }
    }
    if (draft.step === "schedule_type") {
      const lower = trimmed.toLowerCase();
      if (lower.includes("будн") || lower.includes("weekdays")) {
        await this.handleScheduleType(ctx, "weekdays");
        return true;
      } else if (lower.includes("однократ") || lower.includes("разов") || lower.includes("once")) {
        await this.handleScheduleType(ctx, "once");
        return true;
      } else if (
        lower.includes("раз в 3") ||
        lower.includes("каждые 3") ||
        lower.includes("3 дня")
      ) {
        await this.handleScheduleType(ctx, "interval", 3);
        return true;
      } else if (
        lower.includes("раз в недел") ||
        lower.includes("еженедел") ||
        lower.includes("weekly") ||
        lower.includes("7 дн")
      ) {
        await this.handleScheduleType(ctx, "interval", 7);
        return true;
      } else if (
        lower.includes("через день") ||
        lower.includes("раз в 2") ||
        lower.includes("каждые 2") ||
        lower.includes("2 дня") ||
        lower.includes("every 2")
      ) {
        await this.handleScheduleType(ctx, "interval", 2);
        return true;
      } else {
        await this.handleScheduleType(ctx, "daily");
        return true;
      }
    }
    if (draft.step === "times") {
      await this.handleTimes(ctx, trimmed);
      return true;
    }
    if (draft.step === "duration") {
      await this.handleDuration(ctx, trimmed);
      return true;
    }

    return false;
  }

  private async handleTitle(ctx: MenuActionContext, title: string): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.title = title;
    draft.step = "description";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleDescription(ctx: MenuActionContext, desc: string): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.description = desc === "-" ? null : desc;
    draft.step = "category";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleCategory(ctx: MenuActionContext, category: ReminderCategory): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.category = category;
    draft.step = "recipient";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleRecipient(ctx: MenuActionContext, userIds: number[]): Promise<void> {
    if (!userIds || userIds.length === 0) return;
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.targetUserIds = userIds;
    draft.step = "destination";
    await this.settings.setWizardDraft(ctx.userId, draft);

    if (this.deliveryService) {
      for (const id of userIds) {
        void this.tryResolveAndCacheUserProfile(id);
      }
    }

    await ctx.navigateTo(this.name);
  }

  private async tryResolveAndCacheUserProfile(userId: number): Promise<void> {
    try {
      const existing = await this.userRepo.findOneBy({ id: userId });
      if (existing && existing.firstName && !isOtetsIvanovich(existing)) return;

      const chats = await this.chatRepo.find({ where: { isActive: true }, take: 5 });
      let resolved: { firstName: string; lastName: string | null; username: string | null } | null =
        null;
      if (this.deliveryService) {
        for (const chat of chats) {
          resolved = await this.deliveryService.fetchUserProfile(userId, chat.id);
          if (resolved) break;
        }
      }

      if (resolved) {
        if (existing) {
          existing.firstName = resolved.firstName;
          existing.lastName = resolved.lastName;
          existing.username = resolved.username;
          await this.userRepo.save(existing);
        } else {
          const newUser = this.userRepo.create({
            id: userId,
            firstName: resolved.firstName,
            lastName: resolved.lastName,
            username: resolved.username,
            role: "USER",
            dmActive: false,
            language: "ru",
            dataConsent: true,
          });
          await this.userRepo.save(newUser);
        }
      }
    } catch {
      // Ignore background resolution error
    }
  }

  private async handleDestination(
    ctx: MenuActionContext,
    type: "dm" | "group",
    destinationChatId: number,
  ): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.destinationType = type;
    draft.destinationChatId = destinationChatId;
    draft.step = "timezone";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleTimezone(ctx: MenuActionContext, timezone: string): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.timezone = timezone;
    draft.step = "schedule_type";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleScheduleType(
    ctx: MenuActionContext,
    type: ScheduleType,
    intervalDays?: number,
  ): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.scheduleType = type;
    draft.daysOfWeek =
      type === "weekdays" ? [1, 2, 3, 4, 5] : type === "interval" ? [intervalDays ?? 2] : null;
    draft.step = "times";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleTimes(ctx: MenuActionContext, timesStr: string): Promise<void> {
    const times = parseTimesInput(timesStr);

    if (times.length === 0) {
      await ctx.rawCtx.reply(
        ctx.lang === "en"
          ? "⚠️ Could not understand times. Enter times in format '06:00, 20:00' or '6am and 8pm' or '6 and 20'."
          : "⚠️ Не удалось распознать время. Введите время в формате «06:00, 20:00» или «В 6 утра и 8 вечера» или «6 и 20».",
      );
      return;
    }

    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.timesOfDay = times;
    draft.step = "duration";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleDuration(ctx: MenuActionContext, durationStr: string): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    const today = getTodayDateInZone(draft.timezone || this.defaultTimezone);
    draft.startDate = today;

    if (
      durationStr === "forever" ||
      durationStr.toLowerCase().includes("бессрочно") ||
      durationStr.toLowerCase().includes("рекурринг") ||
      durationStr.toLowerCase().includes("постоян") ||
      durationStr.toLowerCase().includes("всегда") ||
      durationStr.toLowerCase().includes("indefinite")
    ) {
      draft.endDate = null;
    } else {
      const days = Number(durationStr.replace(/\D/gu, ""));
      if (days > 0) {
        draft.endDate = addDaysToDate(today, days - 1);
      } else {
        draft.endDate = null;
      }
    }

    draft.step = "confirm";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleConfirm(ctx: MenuActionContext): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    if (!draft.title || !draft.targetUserIds || !draft.timesOfDay) return;

    const customSnoozeRaw = await this.settings.get("app_snooze_intervals");
    const customSnooze = customSnoozeRaw ? (JSON.parse(customSnoozeRaw) as number[]) : undefined;

    const customRepeatRaw = await this.settings.get("app_repeat_intervals");
    const customRepeat = customRepeatRaw ? (JSON.parse(customRepeatRaw) as number[]) : undefined;

    await this.reminderService.createReminder(
      {
        title: draft.title,
        description: draft.description,
        category: draft.category ?? "measurement",
        targetUserIds: draft.targetUserIds,
        destinationChatId: draft.destinationChatId ?? 0,
        destinationType: draft.destinationType ?? (draft.destinationChatId ? "group" : "dm"),
        scheduleType: draft.scheduleType ?? "daily",
        timesOfDay: draft.timesOfDay,
        daysOfWeek: draft.daysOfWeek,
        timezone: draft.timezone ?? this.defaultTimezone,
        startDate: draft.startDate ?? getTodayDateInZone(this.defaultTimezone),
        endDate: draft.endDate,
        snoozeIntervals: customSnooze,
        autoRepeatIntervals: customRepeat,
      },
      ctx.userId,
    );

    await this.settings.clearWizardDraft(ctx.userId);
    await ctx.rawCtx.reply(t(ctx.lang, "wizard_saved_success"));
    await ctx.navigateTo("RemindersMenu");
  }

  private renderPreview(
    draft: WizardDraft,
    lang: Locale,
    usersMap = new Map<number, BotUser>(),
  ): string {
    const desc = draft.description ? `\n_Описание_: ${draft.description}` : "";
    const times = draft.timesOfDay?.join(", ") ?? "—";
    const dest =
      draft.destinationType === "group"
        ? lang === "en"
          ? `Group (\`${draft.destinationChatId}\`)`
          : `Группа (\`${draft.destinationChatId}\`)`
        : lang === "en"
          ? "Direct Messages (DM to each recipient)"
          : "Личные сообщения (ЛС каждому получателю)";
    const dur = draft.endDate
      ? `${draft.startDate} — ${draft.endDate}`
      : lang === "en"
        ? `from ${draft.startDate} (indefinite)`
        : `с ${draft.startDate} (бессрочно)`;

    const recipients =
      draft.targetUserIds && draft.targetUserIds.length > 0
        ? draft.targetUserIds
            .map((id) => {
              const u = usersMap.get(id);
              if (u) {
                const name = getUserDisplayName(u);
                return `${name} (\`${id}\`)`;
              }
              return `\`${id}\``;
            })
            .join(", ")
        : "—";
    const schedule =
      draft.scheduleType === "weekdays"
        ? lang === "en"
          ? "Weekdays (Mon-Fri)"
          : "По будням (Пн-Пт)"
        : draft.scheduleType === "once"
          ? lang === "en"
            ? "Once"
            : "Однократно"
          : draft.scheduleType === "interval"
            ? draft.daysOfWeek?.[0] === 2
              ? lang === "en"
                ? "Every 2 days (alt. days)"
                : "Раз в 2 дня (через день)"
              : lang === "en"
                ? `Every ${draft.daysOfWeek?.[0] ?? 1} days`
                : `Раз в ${draft.daysOfWeek?.[0] ?? 1} дн.`
            : lang === "en"
              ? "Daily"
              : "Каждый день";

    return (
      `📌 *${draft.title}*${desc}\n` +
      `🏷 _Категория_: ${draft.category}\n` +
      `👥 _Получатели_: ${recipients}\n` +
      `💬 _Канал доставки_: ${dest}\n` +
      `🗓 _Периодичность_: ${schedule}\n` +
      `⏰ _Время суток_: ${times} (${draft.timezone})\n` +
      `📅 _Срок_: ${dur}`
    );
  }

  private async getOrCreateDraft(userId: number): Promise<WizardDraft> {
    const existing = await this.settings.getWizardDraft<WizardDraft>(userId);
    if (existing) return existing;

    const initial: WizardDraft = { step: "title" };
    await this.settings.setWizardDraft(userId, initial);
    return initial;
  }
}
