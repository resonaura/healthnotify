import type { Repository } from "typeorm";
import { t } from "../../i18n/index.js";
import type { RegisteredChat } from "../../persistence/entities/registered-chat.entity.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export class ChatsMenu extends Menu {
  public readonly name = "ChatsMenu";
  private chats: RegisteredChat[] = [];

  constructor(
    private readonly chatRepo: Repository<RegisteredChat>,
    private readonly defaultGroupChatId: number | null,
  ) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    this.chats = await this.chatRepo.find({ order: { createdAt: "DESC" } });

    this.buttons = [
      [new Button(t(ctx.lang, "btn_refresh"), (actionCtx) => actionCtx.navigateTo(this.name))],
      [new Button(t(ctx.lang, "btn_back_main"), (actionCtx) => actionCtx.navigateTo("MainMenu"))],
    ];
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const list: string[] = [];

    if (this.defaultGroupChatId) {
      const label =
        ctx.lang === "en" ? "⭐ *Primary Family Group*" : "⭐ *Основная семейная группа*";
      list.push(`${label}: \`${this.defaultGroupChatId}\``);
    }

    for (const c of this.chats) {
      if (c.id !== this.defaultGroupChatId) {
        list.push(`💬 *${c.title}* (\`${c.id}\`) · ${c.chatType}`);
      }
    }

    if (list.length === 0) {
      list.push(
        ctx.lang === "en" ? "_No delivery groups connected._" : "_Нет привязанных групп доставки._",
      );
    }

    await ctx.rawCtx.reply(t(ctx.lang, "chats_header", { lines: list.join("\n\n") }), {
      ...this.getKeyboard(),
      parse_mode: "Markdown",
    });
  }
}
