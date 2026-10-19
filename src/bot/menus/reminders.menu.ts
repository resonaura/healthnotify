import { t } from "../../i18n/index.js";
import type { ReminderDefinition } from "../../persistence/entities/reminder-definition.entity.js";
import type { ReminderService } from "../../services/reminder.service.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export class RemindersMenu extends Menu {
  public readonly name = "RemindersMenu";
  private reminders: ReminderDefinition[] = [];

  constructor(private readonly reminderService: ReminderService) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    this.reminders = await this.reminderService.listReminders();

    this.buttons = [];

    for (const rule of this.reminders.slice(0, 10)) {
      const statusIcon = rule.activeStatus === "active" ? "🟢" : "⏸";
      const timesStr = rule.getTimesOfDay().join(", ");
      const label = `#${rule.id} ${statusIcon} ${rule.title} (${timesStr})`;

      this.buttons.push([
        new Button(label, async (actionCtx) => {
          const isPaused = rule.activeStatus === "paused";
          const actionText = isPaused ? "возобновлено" : "приостановлено";

          if (isPaused) {
            await this.reminderService.resumeReminder(rule.id, actionCtx.userId);
          } else {
            await this.reminderService.pauseReminder(rule.id, actionCtx.userId);
          }

          await actionCtx.rawCtx.reply(`Напоминание #${rule.id} «${rule.title}» ${actionText}.`);
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
    if (this.reminders.length === 0) {
      await ctx.rawCtx.reply(t(ctx.lang, "reminders_empty"), this.getKeyboard());
      return;
    }

    const lines = this.reminders.map((rule) => {
      const statusIcon = rule.activeStatus === "active" ? "🟢 Активно" : "⏸ На паузе";
      const timesStr = rule.getTimesOfDay().join(", ");
      const dates = rule.endDate
        ? `${rule.startDate} — ${rule.endDate}`
        : `с ${rule.startDate} (бессрочно)`;
      return `📌 *#${rule.id} ${rule.title}*\nСтатус: ${statusIcon}\nВремя: ${timesStr} (${rule.timezone})\nПериод: ${dates}`;
    });

    await ctx.rawCtx.reply(t(ctx.lang, "reminders_list_header", { lines: lines.join("\n\n") }), {
      ...this.getKeyboard(),
      parse_mode: "Markdown",
    });
  }
}
