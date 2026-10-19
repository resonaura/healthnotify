import { InlineKeyboard } from "grammy";
import type { Locale } from "../i18n/index.js";
import { t } from "../i18n/index.js";
import type { BotUser } from "../persistence/entities/bot-user.entity.js";
import type { ReminderDefinition } from "../persistence/entities/reminder-definition.entity.js";
import type { ReminderOccurrence } from "../persistence/entities/reminder-occurrence.entity.js";
import { formatTimeInZone } from "../shared/time.js";

export interface TelegramApi {
  sendMessage(
    chatId: number,
    text: string,
    other?: Record<string, unknown>,
  ): Promise<{ message_id: number }>;
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    other?: Record<string, unknown>,
  ): Promise<unknown>;
  editMessageReplyMarkup(
    chatId: number,
    messageId: number,
    other?: Record<string, unknown>,
  ): Promise<unknown>;
  getChat?(chatId: number): Promise<unknown>;
  getChatMember?(chatId: number, userId: number): Promise<unknown>;
}

export function buildActionKeyboard(occurrenceId: string, lang: Locale = "ru"): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, "btn_done"), `act:d:${occurrenceId}`)
    .text(t(lang, "btn_later"), `act:s:${occurrenceId}`)
    .text(t(lang, "btn_skip"), `act:k:${occurrenceId}`);
}

export function buildSnoozedKeyboard(occurrenceId: string, lang: Locale = "ru"): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, "btn_done"), `act:d:${occurrenceId}`)
    .text(t(lang, "btn_skip"), `act:k:${occurrenceId}`);
}

export function isOtetsIvanovich(
  user: { firstName?: string | null; lastName?: string | null; id?: number } | null | undefined,
): boolean {
  if (!user) return false;
  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");

  if (/^отец\s+иванович$/iu.test(fullName) || /^отец$/iu.test(fullName)) {
    return true;
  }

  // Exception purely for this user (915156343)
  if (
    user.id === 915156343 &&
    (/отец/iu.test(fullName) || /михаил/iu.test(fullName) || fullName === "Mike")
  ) {
    return true;
  }

  return false;
}

export function getUserDisplayName(
  u:
    | {
        firstName?: string | null;
        lastName?: string | null;
        username?: string | null;
        id?: number;
      }
    | null
    | undefined,
): string {
  if (!u) return "Пользователь";
  if (isOtetsIvanovich(u)) return "Mike";
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (fullName && !fullName.toLowerCase().startsWith("отец")) return fullName;
  if (u.username) return `@${u.username}`;
  return u.id ? `ID: ${u.id}` : "Пользователь";
}

export function formatTargetMention(user: BotUser): string {
  if (isOtetsIvanovich(user)) {
    return `[Mike](tg://user?id=${user.id})`;
  }
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (user.username) {
    return fullName && fullName !== `@${user.username}`
      ? `[${fullName}](tg://user?id=${user.id}) (@${user.username})`
      : `@${user.username}`;
  }
  const displayName = fullName || `Пользователь`;
  return `[${displayName}](tg://user?id=${user.id})`;
}

export function buildReminderMessageText(
  definition: ReminderDefinition,
  occurrence: ReminderOccurrence,
  targetUser: BotUser,
  destinationChatId: number,
  lang: Locale = "ru",
): string {
  const plannedTimeStr = formatTimeInZone(occurrence.plannedAtUtc, definition.timezone);
  const isGroup = destinationChatId < 0;

  const header = isGroup
    ? t(lang, "reminder_group_header", { targetMention: formatTargetMention(targetUser) })
    : t(lang, "reminder_dm_header");

  const descriptionPart = definition.description ? `\n_${definition.description}_` : "";

  return `${header}\n\n${t(lang, "reminder_body", {
    title: definition.title,
    descriptionPart,
    plannedTime: plannedTimeStr,
  })}`;
}

export class DeliveryService {
  constructor(public readonly api: TelegramApi) {}

  public async fetchUserProfile(
    userId: number,
    chatId?: number,
  ): Promise<{ firstName: string; lastName: string | null; username: string | null } | null> {
    if (this.api.getChat) {
      try {
        const chat = (await this.api.getChat(userId)) as
          { first_name?: string; last_name?: string; username?: string } | undefined;
        if (chat && typeof chat.first_name === "string") {
          return {
            firstName: chat.first_name,
            lastName: chat.last_name ?? null,
            username: chat.username ?? null,
          };
        }
      } catch {
        // getChat can fail if user hasn't DM'd bot
      }
    }

    if (chatId && chatId < 0 && this.api.getChatMember) {
      try {
        const member = (await this.api.getChatMember(chatId, userId)) as
          { user?: { first_name?: string; last_name?: string; username?: string } } | undefined;
        if (member?.user && typeof member.user.first_name === "string") {
          return {
            firstName: member.user.first_name,
            lastName: member.user.last_name ?? null,
            username: member.user.username ?? null,
          };
        }
      } catch {
        // member not found or bot lacks permissions
      }
    }

    return null;
  }

  public async sendReminderCard(
    definition: ReminderDefinition,
    occurrence: ReminderOccurrence,
    targetUser: BotUser,
    destinationChatId: number,
    lang: Locale = "ru",
  ): Promise<number> {
    const messageText = buildReminderMessageText(
      definition,
      occurrence,
      targetUser,
      destinationChatId,
      lang,
    );

    const keyboard = buildActionKeyboard(occurrence.id, lang);

    const sent = await this.api.sendMessage(destinationChatId, messageText, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });

    return sent.message_id;
  }

  public async updateCardOnSnooze(
    chatId: number,
    messageId: number,
    originalText: string,
    snoozedUntilUtc: Date,
    snoozeCount: number,
    timezone: string,
    occurrenceId: string,
    lang: Locale = "ru",
  ): Promise<void> {
    const snoozedTimeStr = formatTimeInZone(snoozedUntilUtc, timezone);
    const statusPart = t(lang, "reminder_status_snoozed", {
      snoozedTime: snoozedTimeStr,
      count: snoozeCount,
    });

    const updatedText = `${originalText}${statusPart}`;
    const keyboard = buildSnoozedKeyboard(occurrenceId, lang);

    try {
      await this.api.editMessageText(chatId, messageId, updatedText, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } catch {
      // Best-effort edit, keep server state authoritative
    }
  }

  public async updateCardOnCompleted(
    chatId: number,
    messageId: number,
    originalText: string,
    completedAtUtc: Date,
    timezone: string,
    lang: Locale = "ru",
  ): Promise<void> {
    const completedTimeStr = formatTimeInZone(completedAtUtc, timezone);
    const statusPart = t(lang, "reminder_status_completed", {
      completedTime: completedTimeStr,
    });

    const updatedText = `${originalText}${statusPart}`;

    try {
      await this.api.editMessageText(chatId, messageId, updatedText, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      await this.deactivateButtons(chatId, messageId);
    }
  }

  public async updateCardOnSkipped(
    chatId: number,
    messageId: number,
    originalText: string,
    skippedAtUtc: Date,
    timezone: string,
    lang: Locale = "ru",
  ): Promise<void> {
    const skippedTimeStr = formatTimeInZone(skippedAtUtc, timezone);
    const statusPart = t(lang, "reminder_status_skipped", {
      skippedTime: skippedTimeStr,
    });

    const updatedText = `${originalText}${statusPart}`;

    try {
      await this.api.editMessageText(chatId, messageId, updatedText, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      await this.deactivateButtons(chatId, messageId);
    }
  }

  public async deactivateButtons(chatId: number, messageId: number): Promise<void> {
    try {
      await this.api.editMessageReplyMarkup(chatId, messageId, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // Suppress if message already deleted or markup already cleared
    }
  }
}
