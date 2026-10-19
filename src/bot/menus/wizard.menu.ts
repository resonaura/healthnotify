import type { Locale } from "../../i18n/index.js";
import { t } from "../../i18n/index.js";
import type {
  ReminderCategory,
  ScheduleType,
} from "../../persistence/entities/reminder-definition.entity.js";
import type { SettingsStore } from "../../persistence/settings.store.js";
import type { ReminderService } from "../../services/reminder.service.js";
import { addDaysToDate, getTodayDateInZone } from "../../shared/time.js";
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
    private readonly defaultFatherId: number | null,
    private readonly defaultGroupId: number | null,
    private readonly defaultTimezone: string,
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
          new Button("🩺 Измерить артериальное давление", (act) =>
            this.handleTitle(act, "Измерить артериальное давление"),
          ),
          new Button("💊 Принять лекарство", (act) => this.handleTitle(act, "Принять лекарство")),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "description") {
      this.buttons = [
        [new Button("Пропустить описание (-)", (act) => this.handleDescription(act, "-"))],
        [cancelBtn],
      ];
    } else if (draft.step === "category") {
      this.buttons = [
        [
          new Button("🩺 Измерения", (act) => this.handleCategory(act, "measurement")),
          new Button("💊 Лекарства", (act) => this.handleCategory(act, "medication")),
        ],
        [
          new Button("🏥 Процедура", (act) => this.handleCategory(act, "procedure")),
          new Button("🏃 Упражнения", (act) => this.handleCategory(act, "exercise")),
        ],
        [cancelBtn],
      ];
    } else if (draft.step === "recipient") {
      const row: Button[] = [];
      if (this.defaultFatherId) {
        row.push(
          new Button(`👨 Отец (${this.defaultFatherId})`, (act) =>
            this.handleRecipient(act, String(this.defaultFatherId)),
          ),
        );
      }
      row.push(new Button("👤 Себе", (act) => this.handleRecipient(act, String(act.userId))));
      this.buttons = [row, [cancelBtn]];
    } else if (draft.step === "destination") {
      const row: Button[] = [];
      if (this.defaultGroupId) {
        row.push(new Button("👨‍👩‍👧 Семейная группа", (act) => this.handleDestination(act, "group")));
      }
      row.push(new Button("💬 Личные сообщения (ЛС)", (act) => this.handleDestination(act, "dm")));
      this.buttons = [row, [cancelBtn]];
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
        [new Button("📅 Каждый день", (act) => this.handleScheduleType(act, "daily"))],
        [new Button("💼 По будням (Пн-Пт)", (act) => this.handleScheduleType(act, "weekdays"))],
        [new Button("🎯 Однократно", (act) => this.handleScheduleType(act, "once"))],
        [cancelBtn],
      ];
    } else if (draft.step === "times") {
      this.buttons = [
        [new Button("06:00, 20:00 (утро и вечер)", (act) => this.handleTimes(act, "06:00, 20:00"))],
        [new Button("08:00, 14:00, 20:00", (act) => this.handleTimes(act, "08:00, 14:00, 20:00"))],
        [new Button("09:00", (act) => this.handleTimes(act, "09:00"))],
        [cancelBtn],
      ];
    } else if (draft.step === "duration") {
      this.buttons = [
        [new Button("14 дней (2 недели)", (act) => this.handleDuration(act, "14"))],
        [new Button("7 дней (1 неделя)", (act) => this.handleDuration(act, "7"))],
        [new Button("30 дней (месяц)", (act) => this.handleDuration(act, "30"))],
        [new Button("Бессрочно", (act) => this.handleDuration(act, "forever"))],
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
      const previewText = this.renderPreview(draft, ctx.lang);
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
      const id = Number(trimmed.replace(/\D/gu, ""));
      if (id > 0) {
        await this.handleRecipient(ctx, String(id));
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

  private async handleRecipient(ctx: MenuActionContext, recipientStr: string): Promise<void> {
    const id = Number(recipientStr);
    if (!id || id <= 0) return;
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.targetUserIds = [id];
    draft.step = "destination";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleDestination(ctx: MenuActionContext, type: "dm" | "group"): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.destinationType = type;
    draft.destinationChatId =
      type === "group" && this.defaultGroupId
        ? this.defaultGroupId
        : (draft.targetUserIds?.[0] ?? ctx.userId);
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

  private async handleScheduleType(ctx: MenuActionContext, type: ScheduleType): Promise<void> {
    const draft = await this.getOrCreateDraft(ctx.userId);
    draft.scheduleType = type;
    draft.daysOfWeek = type === "weekdays" ? [1, 2, 3, 4, 5] : null;
    draft.step = "times";
    await this.settings.setWizardDraft(ctx.userId, draft);
    await ctx.navigateTo(this.name);
  }

  private async handleTimes(ctx: MenuActionContext, timesStr: string): Promise<void> {
    const times = timesStr
      .split(",")
      .map((s) => s.trim())
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/u.test(t));

    if (times.length === 0) {
      await ctx.rawCtx.reply(
        "⚠️ Неверный формат времени. Введите время в формате HH:mm, например «06:00, 20:00».",
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

    if (durationStr === "forever" || durationStr.toLowerCase().includes("бессрочно")) {
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

    await this.reminderService.createReminder(
      {
        title: draft.title,
        description: draft.description,
        category: draft.category ?? "measurement",
        targetUserIds: draft.targetUserIds,
        destinationChatId: draft.destinationChatId ?? ctx.chatId,
        destinationType: draft.destinationType ?? "group",
        scheduleType: draft.scheduleType ?? "daily",
        timesOfDay: draft.timesOfDay,
        daysOfWeek: draft.daysOfWeek,
        timezone: draft.timezone ?? this.defaultTimezone,
        startDate: draft.startDate ?? getTodayDateInZone(this.defaultTimezone),
        endDate: draft.endDate,
      },
      ctx.userId,
    );

    await this.settings.clearWizardDraft(ctx.userId);
    await ctx.rawCtx.reply(t(ctx.lang, "wizard_saved_success"));
    await ctx.navigateTo("RemindersMenu");
  }

  private renderPreview(draft: WizardDraft, _lang: Locale): string {
    const desc = draft.description ? `\n_Описание_: ${draft.description}` : "";
    const times = draft.timesOfDay?.join(", ") ?? "—";
    const dest =
      draft.destinationType === "group"
        ? `Группа (${draft.destinationChatId})`
        : "Личные сообщения (ЛС)";
    const dur = draft.endDate
      ? `${draft.startDate} — ${draft.endDate}`
      : `с ${draft.startDate} (бессрочно)`;

    return (
      `📌 *${draft.title}*${desc}\n` +
      `🏷 _Категория_: ${draft.category}\n` +
      `👤 _Получатель_: \`${draft.targetUserIds?.[0]}\`\n` +
      `💬 _Канал доставки_: ${dest}\n` +
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
