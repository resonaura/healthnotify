import type { Context } from "grammy";
import type { Locale } from "../i18n/index.js";
import type { SettingsStore } from "../persistence/settings.store.js";

export type MenuActionContext = {
  rawCtx: Context;
  userId: number;
  chatId: number;
  text: string;
  lang: Locale;
  navigateTo(menuName: string, text?: string): Promise<void>;
};

export type MenuAction = (ctx: MenuActionContext) => Promise<void> | void;

export class Button {
  constructor(
    public readonly text: string,
    public readonly action?: MenuAction,
  ) {}
}

export abstract class Menu {
  public abstract readonly name: string;
  public buttons: Button[][] = [];

  public abstract onInit(ctx: MenuActionContext): Promise<void> | void;
  public abstract onMessage(ctx: MenuActionContext): Promise<void> | void;

  public getKeyboard(): {
    reply_markup: {
      keyboard: { text: string }[][];
      resize_keyboard: true;
      is_persistent: true;
    };
  } {
    return {
      reply_markup: {
        keyboard: this.buttons.map((row) => row.map((button) => ({ text: button.text }))),
        resize_keyboard: true,
        is_persistent: true,
      },
    };
  }
}

export class MenuSystem {
  private readonly menus = new Map<string, Menu>();
  private readonly rootMenuName: string;
  private readonly navigationPrefix: string;

  constructor(
    private readonly settings: SettingsStore,
    options: { rootMenuName?: string; navigationPrefix?: string } = {},
  ) {
    this.rootMenuName = options.rootMenuName ?? "MainMenu";
    this.navigationPrefix = options.navigationPrefix ?? "menu_nav";
  }

  public registerMenu(menu: Menu): void {
    this.menus.set(menu.name, menu);
  }

  public async navigateTo(ctx: Context, menuName: string, text = "/init"): Promise<void> {
    const target = this.menus.get(menuName) ?? this.menus.get(this.rootMenuName);
    if (!target) return;
    await this.settings.set(this.navigationKey(this.userId(ctx)), target.name);
    await this.show(target, ctx, text);
  }

  public async select(ctx: Context, menuName: string): Promise<void> {
    const target = this.menus.get(menuName) ?? this.menus.get(this.rootMenuName);
    if (!target) return;
    await this.settings.set(this.navigationKey(this.userId(ctx)), target.name);
  }

  public async handleButton(
    ctx: Context,
    text: string,
    beforeAction?: () => void,
  ): Promise<boolean> {
    const menu = await this.currentMenu(ctx);
    const menuContext = await this.makeContext(ctx, text);
    await menu.onInit(menuContext);

    const trimmed = text.trim();
    const button = menu.buttons.flat().find((candidate) => {
      if (candidate.text === trimmed) return true;
      // Prefix matching for buttons with dynamic counts (e.g. "📋 Напоминания (5)")
      if (candidate.text.startsWith("📋") && trimmed.startsWith("📋")) return true;
      if (candidate.text.startsWith("#") && trimmed.startsWith("#")) {
        return candidate.text.split(" ")[0] === trimmed.split(" ")[0];
      }
      return false;
    });

    if (!button?.action) return false;
    beforeAction?.();
    await button.action(menuContext);
    return true;
  }

  public async showCurrent(ctx: Context, text: string): Promise<void> {
    const menu = await this.currentMenu(ctx);
    await this.show(menu, ctx, text);
  }

  public async currentKeyboard(ctx: Context): Promise<{
    reply_markup: { keyboard: { text: string }[][]; resize_keyboard: true; is_persistent: true };
  }> {
    const menu = await this.currentMenu(ctx);
    await menu.onInit(await this.makeContext(ctx, "/init"));
    return menu.getKeyboard();
  }

  public async currentName(ctx: Context): Promise<string> {
    return (await this.currentMenu(ctx)).name;
  }

  public async userLang(userId: number): Promise<Locale> {
    return this.settings.getUserLanguage(userId);
  }

  private async currentMenu(ctx: Context): Promise<Menu> {
    const menuName = await this.settings.get(
      this.navigationKey(this.userId(ctx)),
      this.rootMenuName,
    );
    const menu = this.menus.get(menuName) ?? this.menus.get(this.rootMenuName);
    if (!menu) throw new Error(`Root menu ${this.rootMenuName} is not registered`);
    if (menu.name !== menuName) {
      await this.settings.set(this.navigationKey(this.userId(ctx)), menu.name);
    }
    return menu;
  }

  private async show(menu: Menu, ctx: Context, text: string): Promise<void> {
    const menuContext = await this.makeContext(ctx, text);
    await menu.onInit(menuContext);
    await menu.onMessage(menuContext);
  }

  private async makeContext(ctx: Context, text: string): Promise<MenuActionContext> {
    const uid = this.userId(ctx);
    const lang = await this.userLang(uid);
    return {
      rawCtx: ctx,
      userId: uid,
      chatId: ctx.chat!.id,
      text,
      lang,
      navigateTo: (menuName, nextText) => this.navigateTo(ctx, menuName, nextText),
    };
  }

  private userId(ctx: Context): number {
    if (!ctx.from) throw new Error("Telegram user is required for menu navigation");
    return ctx.from.id;
  }

  private navigationKey(userId: number): string {
    return `${this.navigationPrefix}_${userId}`;
  }
}
