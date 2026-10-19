import { t } from "../../i18n/index.js";
import type { ReminderDefinition } from "../../persistence/entities/reminder-definition.entity.js";
import type { SettingsStore } from "../../persistence/settings.store.js";
import type { ReminderService } from "../../services/reminder.service.js";
import { parseTimesInput } from "../../shared/time.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export class RemindersMenu extends Menu {
  public readonly name = "RemindersMenu";
  private reminders: ReminderDefinition[] = [];

  constructor(
    private readonly reminderService: ReminderService,
    private readonly settings: SettingsStore,
  ) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    const selectedIdRaw = await this.settings.get(`reminders_selected_${ctx.userId}`);
    const selectedId = selectedIdRaw ? Number(selectedIdRaw) : null;

    if (selectedId) {
      const rule = await this.reminderService.getReminder(selectedId);
      if (!rule) {
        await this.settings.delete(`reminders_selected_${ctx.userId}`);
        await this.initList(ctx);
        return;
      }

      const isPaused = rule.activeStatus === "paused";
      const togglePauseBtn = new Button(
        isPaused ? t(ctx.lang, "btn_resume_rule") : t(ctx.lang, "btn_pause_rule"),
        async (actionCtx) => {
          if (isPaused) {
            await this.reminderService.resumeReminder(rule.id, actionCtx.userId);
            await actionCtx.rawCtx.reply(
              actionCtx.lang === "en"
                ? `▶️ Reminder #${rule.id} resumed.`
                : `▶️ Напоминание #${rule.id} возобновлено.`,
            );
          } else {
            await this.reminderService.pauseReminder(rule.id, actionCtx.userId);
            await actionCtx.rawCtx.reply(
              actionCtx.lang === "en"
                ? `⏸ Reminder #${rule.id} paused.`
                : `⏸ Напоминание #${rule.id} приостановлено.`,
            );
          }
          await actionCtx.navigateTo(this.name);
        },
      );

      const editTitleBtn = new Button(t(ctx.lang, "btn_edit_title"), async (actionCtx) => {
        await this.settings.set(
          `reminder_edit_${actionCtx.userId}`,
          JSON.stringify({ id: rule.id, field: "title" }),
        );
        await actionCtx.rawCtx.reply(t(actionCtx.lang, "prompt_edit_title", { id: rule.id }));
      });

      const editTimesBtn = new Button(t(ctx.lang, "btn_edit_times"), async (actionCtx) => {
        await this.settings.set(
          `reminder_edit_${actionCtx.userId}`,
          JSON.stringify({ id: rule.id, field: "times" }),
        );
        await actionCtx.rawCtx.reply(t(actionCtx.lang, "prompt_edit_times", { id: rule.id }));
      });

      const archiveBtn = new Button(t(ctx.lang, "btn_archive_rule"), async (actionCtx) => {
        await this.reminderService.deleteReminder(rule.id, actionCtx.userId);
        await this.settings.delete(`reminders_selected_${actionCtx.userId}`);
        await actionCtx.rawCtx.reply(t(actionCtx.lang, "confirm_delete", { title: rule.title }));
        await actionCtx.navigateTo(this.name);
      });

      const backToListBtn = new Button(t(ctx.lang, "btn_back"), async (actionCtx) => {
        await this.settings.delete(`reminders_selected_${actionCtx.userId}`);
        await this.settings.delete(`reminder_edit_${actionCtx.userId}`);
        await actionCtx.navigateTo(this.name);
      });

      this.buttons = [
        [togglePauseBtn],
        [editTitleBtn, editTimesBtn],
        [archiveBtn],
        [backToListBtn],
      ];
      return;
    }

    await this.initList(ctx);
  }

  private async initList(ctx: MenuActionContext): Promise<void> {
    this.reminders = await this.reminderService.listReminders();
    this.buttons = [];

    for (const rule of this.reminders.slice(0, 10)) {
      const statusIcon =
        rule.activeStatus === "active" ? "🟢" : rule.activeStatus === "paused" ? "⏸" : "🗑";
      const timesStr = rule.getTimesOfDay().join(", ");
      const label = `#${rule.id} ${statusIcon} ${rule.title} (${timesStr})`;

      this.buttons.push([
        new Button(label, async (actionCtx) => {
          await this.settings.set(`reminders_selected_${actionCtx.userId}`, String(rule.id));
          await actionCtx.navigateTo(this.name);
        }),
      ]);
    }

    this.buttons.push([
      new Button(t(ctx.lang, "btn_create_reminder"), (actionCtx) =>
        actionCtx.navigateTo("WizardMenu"),
      ),
      new Button(t(ctx.lang, "btn_back_main"), (actionCtx) => actionCtx.navigateTo("MainMenu")),
    ]);
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const selectedIdRaw = await this.settings.get(`reminders_selected_${ctx.userId}`);
    const selectedId = selectedIdRaw ? Number(selectedIdRaw) : null;

    if (selectedId) {
      const rule = await this.reminderService.getReminder(selectedId);
      if (rule) {
        const statusStr =
          rule.activeStatus === "active"
            ? ctx.lang === "en"
              ? "🟢 Active"
              : "🟢 Активно"
            : rule.activeStatus === "paused"
              ? ctx.lang === "en"
                ? "⏸ Paused"
                : "⏸ На паузе"
              : ctx.lang === "en"
                ? "🗑 Archived"
                : "🗑 В архиве";
        const timesStr = rule.getTimesOfDay().join(", ");
        const dates = rule.endDate
          ? `${rule.startDate} — ${rule.endDate}`
          : ctx.lang === "en"
            ? `from ${rule.startDate} (indefinite)`
            : `с ${rule.startDate} (бессрочно)`;
        const recipients = rule.getTargetUserIds().join(", ");
        const destination =
          rule.destinationType === "dm"
            ? ctx.lang === "en"
              ? "Direct Messages (DM to each)"
              : "Личные сообщения (ЛС каждому)"
            : ctx.lang === "en"
              ? `Group (ID: ${rule.destinationChatId})`
              : `Группа (ID: ${rule.destinationChatId})`;

        const scheduleStr =
          rule.scheduleType === "weekdays"
            ? ctx.lang === "en"
              ? "Weekdays (Mon-Fri)"
              : "По будням (Пн-Пт)"
            : rule.scheduleType === "once"
              ? ctx.lang === "en"
                ? "Once"
                : "Однократно"
              : rule.scheduleType === "interval"
                ? rule.getIntervalDays() === 2
                  ? ctx.lang === "en"
                    ? "Every 2 days (alt. days)"
                    : "Раз в 2 дня (через день)"
                  : ctx.lang === "en"
                    ? `Every ${rule.getIntervalDays()} days`
                    : `Раз в ${rule.getIntervalDays()} дн.`
                : ctx.lang === "en"
                  ? "Daily"
                  : "Каждый день";

        await ctx.rawCtx.reply(
          t(ctx.lang, "reminders_detail_header", {
            id: rule.id,
            title: rule.title,
            category: rule.category,
            status: statusStr,
            schedule: scheduleStr,
            times: timesStr,
            timezone: rule.timezone,
            dates,
            recipients,
            destination,
            snooze: rule.snoozeIntervalsJson,
            repeat: rule.autoRepeatIntervalsJson,
          }),
          {
            ...this.getKeyboard(),
            parse_mode: "Markdown",
          },
        );
        return;
      }
    }

    if (this.reminders.length === 0) {
      await ctx.rawCtx.reply(t(ctx.lang, "reminders_empty"), this.getKeyboard());
      return;
    }

    const lines = this.reminders.map((rule) => {
      const statusIcon =
        rule.activeStatus === "active" ? "🟢" : rule.activeStatus === "paused" ? "⏸" : "🗑";
      const timesStr = rule.getTimesOfDay().join(", ");
      const dates = rule.endDate
        ? `${rule.startDate} — ${rule.endDate}`
        : ctx.lang === "en"
          ? `from ${rule.startDate} (indefinite)`
          : `с ${rule.startDate} (бессрочно)`;
      const timeLabel = ctx.lang === "en" ? "Time" : "Время";
      const periodLabel = ctx.lang === "en" ? "Period" : "Период";
      return `📌 *#${rule.id} ${statusIcon} ${rule.title}*\n${timeLabel}: ${timesStr} (${rule.timezone})\n${periodLabel}: ${dates}`;
    });

    await ctx.rawCtx.reply(t(ctx.lang, "reminders_list_header", { lines: lines.join("\n\n") }), {
      ...this.getKeyboard(),
      parse_mode: "Markdown",
    });
  }

  public async handleTextInput(ctx: MenuActionContext, text: string): Promise<boolean> {
    const editRaw = await this.settings.get(`reminder_edit_${ctx.userId}`);
    if (!editRaw) return false;

    try {
      const editState = JSON.parse(editRaw) as { id: number; field: "title" | "times" };
      const trimmed = text.trim();

      if (editState.field === "title") {
        if (trimmed.length > 0) {
          await this.reminderService.updateReminder(editState.id, { title: trimmed }, ctx.userId);
          await this.settings.delete(`reminder_edit_${ctx.userId}`);
          await ctx.rawCtx.reply(t(ctx.lang, "reminder_updated_success", { id: editState.id }));
          await ctx.navigateTo(this.name);
          return true;
        }
      } else if (editState.field === "times") {
        const times = parseTimesInput(trimmed);

        if (times.length > 0) {
          await this.reminderService.updateReminder(
            editState.id,
            { timesOfDay: times },
            ctx.userId,
          );
          await this.settings.delete(`reminder_edit_${ctx.userId}`);
          await ctx.rawCtx.reply(t(ctx.lang, "reminder_updated_success", { id: editState.id }));
          await ctx.navigateTo(this.name);
          return true;
        } else {
          await ctx.rawCtx.reply(
            ctx.lang === "en"
              ? "⚠️ Could not understand times. Enter times in format '06:00, 20:00' or '6am and 8pm' or '6 and 20'."
              : "⚠️ Не удалось распознать время. Введите время в формате «06:00, 20:00» или «В 6 утра и 8 вечера» или «6 и 20».",
          );
          return true;
        }
      }
    } catch {
      await this.settings.delete(`reminder_edit_${ctx.userId}`);
    }

    return false;
  }
}
