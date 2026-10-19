import { languageKeyboard, t } from "../../i18n/index.js";
import type { ReminderService } from "../../services/reminder.service.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export class MainMenu extends Menu {
  public readonly name = "MainMenu";
  private activeCount = 0;

  constructor(private readonly reminderService: ReminderService) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    const activeRules = await this.reminderService.listReminders("active");
    this.activeCount = activeRules.length;

    const remindersBtnLabel =
      this.activeCount > 0
        ? t(ctx.lang, "btn_reminders", { count: this.activeCount })
        : t(ctx.lang, "btn_reminders_empty");

    this.buttons = [
      [new Button(remindersBtnLabel, (actionCtx) => actionCtx.navigateTo("RemindersMenu"))],
      [
        new Button(t(ctx.lang, "btn_create_reminder"), (actionCtx) =>
          actionCtx.navigateTo("WizardMenu"),
        ),
      ],
      [
        new Button(t(ctx.lang, "btn_recipients"), (actionCtx) =>
          actionCtx.navigateTo("RecipientsMenu"),
        ),
        new Button(t(ctx.lang, "btn_chats"), (actionCtx) => actionCtx.navigateTo("ChatsMenu")),
      ],
      [new Button(t(ctx.lang, "btn_history"), (actionCtx) => actionCtx.navigateTo("HistoryMenu"))],
      [
        new Button(t(ctx.lang, "btn_settings"), (actionCtx) =>
          actionCtx.navigateTo("SettingsMenu"),
        ),
        new Button(t(ctx.lang, "btn_language"), async (actionCtx) => {
          await actionCtx.rawCtx.reply(t(actionCtx.lang, "choose_language"), {
            reply_markup: languageKeyboard(),
          });
        }),
      ],
    ];
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const greeting = ctx.text.startsWith("/start") ? t(ctx.lang, "main_menu_greeting") : "";
    const info = t(ctx.lang, "main_menu_info", { activeCount: this.activeCount });
    await ctx.rawCtx.reply(`${greeting}${info}`, this.getKeyboard());
  }
}
