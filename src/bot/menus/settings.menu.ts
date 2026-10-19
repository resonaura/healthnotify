import type { AppEnv } from "../../config/env.js";
import { languageKeyboard, t } from "../../i18n/index.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export class SettingsMenu extends Menu {
  public readonly name = "SettingsMenu";

  constructor(private readonly env: AppEnv) {
    super();
  }

  public onInit(ctx: MenuActionContext): void {
    this.buttons = [
      [
        new Button(t(ctx.lang, "btn_language"), async (actionCtx) => {
          await actionCtx.rawCtx.reply(t(actionCtx.lang, "choose_language"), {
            reply_markup: languageKeyboard(),
          });
        }),
      ],
      [new Button(t(ctx.lang, "btn_back_main"), (actionCtx) => actionCtx.navigateTo("MainMenu"))],
    ];
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const text = t(ctx.lang, "settings_header", {
      timezone: this.env.DEFAULT_TIMEZONE,
      language: ctx.lang.toUpperCase(),
      snoozeIntervals: this.env.DEFAULT_SNOOZE_INTERVALS.join(", "),
      repeatIntervals: this.env.DEFAULT_AUTO_REPEAT_INTERVALS.join(", "),
      admins: this.env.TG_ADMIN_USER_IDS.join(", "),
    });

    await ctx.rawCtx.reply(text, this.getKeyboard());
  }
}
