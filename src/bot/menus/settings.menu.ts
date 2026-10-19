import type { AppEnv } from "../../config/env.js";
import { languageKeyboard, t } from "../../i18n/index.js";
import type { SettingsStore } from "../../persistence/settings.store.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

const SNOOZE_PRESETS: number[][] = [
  [5, 10, 20, 40, 60],
  [10, 20, 30],
  [5, 15, 30],
  [15, 30, 60],
];

const REPEAT_PRESETS: number[][] = [
  [5, 10, 20, 40],
  [10, 20, 30],
  [5, 5, 5],
  [15, 30],
];

export class SettingsMenu extends Menu {
  public readonly name = "SettingsMenu";

  constructor(
    private readonly env: AppEnv,
    private readonly settings: SettingsStore,
  ) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    const snoozeBtn = new Button(t(ctx.lang, "btn_snooze_intervals"), async (actionCtx) => {
      const currentRaw = await this.settings.get("app_snooze_intervals");
      let currentIdx = 0;
      if (currentRaw) {
        const parsed = JSON.parse(currentRaw) as number[];
        const idx = SNOOZE_PRESETS.findIndex((p) => JSON.stringify(p) === JSON.stringify(parsed));
        if (idx >= 0) currentIdx = (idx + 1) % SNOOZE_PRESETS.length;
      } else {
        currentIdx = 1;
      }
      const nextPreset = SNOOZE_PRESETS[currentIdx] ?? [5, 10, 20, 40, 60];
      await this.settings.set("app_snooze_intervals", JSON.stringify(nextPreset));
      await actionCtx.rawCtx.reply(
        t(actionCtx.lang, "settings_snooze_updated", { intervals: nextPreset.join(", ") }),
      );
      await actionCtx.navigateTo(this.name);
    });

    const repeatBtn = new Button(t(ctx.lang, "btn_repeat_intervals"), async (actionCtx) => {
      const currentRaw = await this.settings.get("app_repeat_intervals");
      let currentIdx = 0;
      if (currentRaw) {
        const parsed = JSON.parse(currentRaw) as number[];
        const idx = REPEAT_PRESETS.findIndex((p) => JSON.stringify(p) === JSON.stringify(parsed));
        if (idx >= 0) currentIdx = (idx + 1) % REPEAT_PRESETS.length;
      } else {
        currentIdx = 1;
      }
      const nextPreset = REPEAT_PRESETS[currentIdx] ?? [5, 10, 20, 40];
      await this.settings.set("app_repeat_intervals", JSON.stringify(nextPreset));
      await actionCtx.rawCtx.reply(
        t(actionCtx.lang, "settings_repeat_updated", { intervals: nextPreset.join(", ") }),
      );
      await actionCtx.navigateTo(this.name);
    });

    this.buttons = [
      [
        new Button(t(ctx.lang, "btn_language"), async (actionCtx) => {
          await actionCtx.rawCtx.reply(t(actionCtx.lang, "choose_language"), {
            reply_markup: languageKeyboard(),
          });
        }),
      ],
      [snoozeBtn, repeatBtn],
      [new Button(t(ctx.lang, "btn_back_main"), (actionCtx) => actionCtx.navigateTo("MainMenu"))],
    ];
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const snoozeRaw = await this.settings.get("app_snooze_intervals");
    const snooze = snoozeRaw
      ? (JSON.parse(snoozeRaw) as number[])
      : this.env.DEFAULT_SNOOZE_INTERVALS;

    const repeatRaw = await this.settings.get("app_repeat_intervals");
    const repeat = repeatRaw
      ? (JSON.parse(repeatRaw) as number[])
      : this.env.DEFAULT_AUTO_REPEAT_INTERVALS;

    const text = t(ctx.lang, "settings_header", {
      timezone: this.env.DEFAULT_TIMEZONE,
      language: ctx.lang.toUpperCase(),
      snoozeIntervals: snooze.join(", "),
      repeatIntervals: repeat.join(", "),
      admins: this.env.TG_ADMIN_USER_IDS.join(", "),
    });

    await ctx.rawCtx.reply(text, this.getKeyboard());
  }
}
