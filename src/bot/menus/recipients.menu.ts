import type { Repository } from "typeorm";
import { t } from "../../i18n/index.js";
import type { BotUser } from "../../persistence/entities/bot-user.entity.js";
import { getUserDisplayName } from "../../services/delivery.service.js";
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
            const name = getUserDisplayName(u);
            const usernamePart = u.username ? ` (@${u.username})` : "";
            const dmStatus = u.dmActive
              ? ctx.lang === "en"
                ? "✅ DM active"
                : "✅ ЛС активно"
              : ctx.lang === "en"
                ? "⚠️ DM not started"
                : "⚠️ ЛС не начато";
            const roleLabel = ctx.lang === "en" ? "Role" : "Роль";
            return `👤 *${name}${usernamePart}* (ID: \`${u.id}\`)\n${roleLabel}: ${u.role} · ${dmStatus}`;
          })
        : [
            ctx.lang === "en"
              ? "_No registered users yet._"
              : "_Пока нет зарегистрированных пользователей._",
          ];

    await ctx.rawCtx.reply(t(ctx.lang, "recipients_header", { lines: lines.join("\n\n") }), {
      ...this.getKeyboard(),
      parse_mode: "Markdown",
    });
  }
}
