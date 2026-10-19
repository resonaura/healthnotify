import type { Repository } from "typeorm";
import { t } from "../../i18n/index.js";
import type { BotUser } from "../../persistence/entities/bot-user.entity.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export class RecipientsMenu extends Menu {
  public readonly name = "RecipientsMenu";
  private users: BotUser[] = [];

  constructor(private readonly userRepo: Repository<BotUser>) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    this.users = await this.userRepo.find({ order: { createdAt: "DESC" } });

    this.buttons = [
      [new Button(t(ctx.lang, "btn_refresh"), (actionCtx) => actionCtx.navigateTo(this.name))],
      [new Button(t(ctx.lang, "btn_back_main"), (actionCtx) => actionCtx.navigateTo("MainMenu"))],
    ];
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const lines =
      this.users.length > 0
        ? this.users.map((u) => {
            const usernamePart = u.username ? ` (@${u.username})` : "";
            const dmStatus = u.dmActive ? "✅ ЛС активно" : "⚠️ ЛС не начато";
            return `👤 *${u.firstName}${usernamePart}* (ID: \`${u.id}\`)\nРоль: ${u.role} · ${dmStatus}`;
          })
        : ["_Пока нет зарегистрированных пользователей._"];

    await ctx.rawCtx.reply(t(ctx.lang, "recipients_header", { lines: lines.join("\n\n") }), {
      ...this.getKeyboard(),
      parse_mode: "Markdown",
    });
  }
}
