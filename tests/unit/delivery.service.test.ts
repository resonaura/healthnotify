import { describe, expect, it, vi } from "vitest";
import {
  DeliveryService,
  formatTargetMention,
  type TelegramApi,
} from "../../src/services/delivery.service.js";
import { BotUser } from "../../src/persistence/entities/bot-user.entity.js";
import { ReminderDefinition } from "../../src/persistence/entities/reminder-definition.entity.js";
import { ReminderOccurrence } from "../../src/persistence/entities/reminder-occurrence.entity.js";

describe("DeliveryService Unit", () => {
  it("formats target mention correctly for users with and without username", () => {
    const userWithUsername = new BotUser();
    userWithUsername.id = 12345;
    userWithUsername.username = "father_tg";
    userWithUsername.firstName = "Father";
    expect(formatTargetMention(userWithUsername)).toBe("[Father](tg://user?id=12345) (@father_tg)");

    const userNoUsernameWithLast = new BotUser();
    userNoUsernameWithLast.id = 67890;
    userNoUsernameWithLast.firstName = "John";
    userNoUsernameWithLast.lastName = "Doe";
    expect(formatTargetMention(userNoUsernameWithLast)).toBe("[John Doe](tg://user?id=67890)");

    const userFirstOnly = new BotUser();
    userFirstOnly.id = 11111;
    userFirstOnly.firstName = "Alice";
    expect(formatTargetMention(userFirstOnly)).toBe("[Alice](tg://user?id=11111)");
  });

  it("handles sendReminderCard for DM and group chats with/without description", async () => {
    const mockApi: TelegramApi = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 999 }),
      editMessageText: vi.fn().mockResolvedValue({}),
      editMessageReplyMarkup: vi.fn().mockResolvedValue({}),
    };

    const service = new DeliveryService(mockApi);

    const def = new ReminderDefinition();
    def.id = 1;
    def.title = "Blood Pressure";
    def.description = "Measure sitting down";
    def.timezone = "Europe/Moscow";

    const occ = new ReminderOccurrence();
    occ.id = "occ-test";
    occ.plannedAtUtc = new Date("2026-10-19T03:00:00Z");

    const user = new BotUser();
    user.id = 915156343;
    user.username = "father_user";

    // 1. Group send (chatId < 0)
    const groupMsgId = await service.sendReminderCard(def, occ, user, -1004301185075, "ru");
    expect(groupMsgId).toBe(999);
    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      -1004301185075,
      expect.stringContaining("@father_user"),
      expect.any(Object),
    );

    // 2. DM send (chatId > 0) without description
    def.description = null;
    await service.sendReminderCard(def, occ, user, 915156343, "en");
    expect(mockApi.sendMessage).toHaveBeenCalledWith(
      915156343,
      expect.not.stringContaining("@father_user"),
      expect.any(Object),
    );
  });

  it("gracefully catches and handles errors in card update methods", async () => {
    const mockApi: TelegramApi = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      editMessageText: vi.fn().mockRejectedValue(new Error("Message to edit not found")),
      editMessageReplyMarkup: vi.fn().mockRejectedValue(new Error("Network timeout")),
    };

    const service = new DeliveryService(mockApi);

    // updateCardOnSnooze swallows error
    await expect(
      service.updateCardOnSnooze(123, 456, "Orig", new Date(), 1, "Europe/Moscow", "occ-1", "ru"),
    ).resolves.toBeUndefined();

    // updateCardOnCompleted attempts deactivateButtons on error and swallows
    await expect(
      service.updateCardOnCompleted(123, 456, "Orig", new Date(), "Europe/Moscow", "ru"),
    ).resolves.toBeUndefined();

    // updateCardOnSkipped attempts deactivateButtons on error and swallows
    await expect(
      service.updateCardOnSkipped(123, 456, "Orig", new Date(), "Europe/Moscow", "ru"),
    ).resolves.toBeUndefined();

    // deactivateButtons swallows error
    await expect(service.deactivateButtons(123, 456)).resolves.toBeUndefined();
  });
});
