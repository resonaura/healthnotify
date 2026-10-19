import { t } from "../../i18n/index.js";
import type { ComplianceStats, HistoryService } from "../../services/history.service.js";
import { Button, Menu, type MenuActionContext } from "../menu-system.js";

export class HistoryMenu extends Menu {
  public readonly name = "HistoryMenu";
  private weekStats: ComplianceStats | null = null;
  private allStats: ComplianceStats | null = null;

  constructor(private readonly historyService: HistoryService) {
    super();
  }

  public async onInit(ctx: MenuActionContext): Promise<void> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.weekStats = await this.historyService.getComplianceStats(undefined, weekAgo);
    this.allStats = await this.historyService.getComplianceStats();

    this.buttons = [
      [new Button(t(ctx.lang, "btn_refresh"), (actionCtx) => actionCtx.navigateTo(this.name))],
      [new Button(t(ctx.lang, "btn_back_main"), (actionCtx) => actionCtx.navigateTo("MainMenu"))],
    ];
  }

  public async onMessage(ctx: MenuActionContext): Promise<void> {
    const s = this.weekStats;

    if (!s || s.totalOccurrences === 0) {
      await ctx.rawCtx.reply(t(ctx.lang, "history_empty"), this.getKeyboard());
      return;
    }

    const text = t(ctx.lang, "history_header", {
      period: ctx.lang === "en" ? "Last 7 days" : "Последние 7 дней",
      total: s.totalOccurrences,
      completed: s.completed,
      completionRate: s.completionRate,
      skipped: s.skipped,
      missed: s.missed,
      snoozes: s.snoozes,
    });

    const allPart = this.allStats
      ? `\n\n_За всё время: выполнено ${this.allStats.completed} из ${this.allStats.totalOccurrences} (${this.allStats.completionRate}%)_`
      : "";

    await ctx.rawCtx.reply(`${text}${allPart}`, {
      ...this.getKeyboard(),
      parse_mode: "Markdown",
    });
  }
}
