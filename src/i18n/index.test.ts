import { describe, expect, it } from "vitest";
import {
  languageKeyboard,
  pluralDays,
  pluralMinutes,
  pluralReminders,
  pluralTimes,
  pluralizeRu,
  t,
  translations,
  type TranslationKey,
} from "./index.js";

describe("i18n system", () => {
  it("translates keys in both ru and en", () => {
    expect(t("ru", "btn_language")).toBe("🌐 Язык");
    expect(t("en", "btn_language")).toBe("🌐 Language");
    expect(t("ru", "btn_done")).toBe("✅ Сделано");
    expect(t("en", "btn_done")).toBe("✅ Done");
  });

  it("has identical translation keys across ru and en", () => {
    const ruKeys = Object.keys(translations.ru) as TranslationKey[];
    const enKeys = Object.keys(translations.en) as TranslationKey[];
    expect(ruKeys.sort()).toEqual(enKeys.sort());
  });

  it("interpolates parameters correctly", () => {
    const rendered = t("ru", "reminder_snoozed_ack", { minutes: 10, time: "06:15" });
    expect(rendered).toBe("🕒 Напоминание отложено на 10 мин. (до 06:15).");

    const renderedEn = t("en", "reminder_snoozed_ack", { minutes: 10, time: "06:15" });
    expect(renderedEn).toBe("🕒 Snoozed for 10 min (until 06:15).");
  });

  it("handles Russian pluralization correctly", () => {
    expect(pluralizeRu(1, "день", "дня", "дней")).toBe("1 день");
    expect(pluralizeRu(2, "день", "дня", "дней")).toBe("2 дня");
    expect(pluralizeRu(5, "день", "дня", "дней")).toBe("5 дней");
    expect(pluralizeRu(11, "день", "дня", "дней")).toBe("11 дней");
    expect(pluralizeRu(21, "день", "дня", "дней")).toBe("21 день");

    expect(pluralDays("ru", 1)).toBe("1 день");
    expect(pluralDays("ru", 14)).toBe("14 дней");
    expect(pluralDays("en", 14)).toBe("14 days");

    expect(pluralTimes("ru", 2)).toBe("2 раза");
    expect(pluralTimes("ru", 5)).toBe("5 раз");
    expect(pluralTimes("en", 2)).toBe("2 times");

    expect(pluralMinutes("ru", 1)).toBe("1 минута");
    expect(pluralMinutes("ru", 5)).toBe("5 минут");

    expect(pluralReminders("ru", 1)).toBe("1 напоминание");
    expect(pluralReminders("ru", 3)).toBe("3 напоминания");
  });

  it("creates language keyboard without flags", () => {
    const kb = languageKeyboard();
    const buttons = kb.inline_keyboard.flat();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.text).toBe("Русский");
    expect(buttons[1]?.text).toBe("English");
    for (const btn of buttons) {
      expect(btn.text).not.toMatch(/[\uD83C][\uDDE6-\uDDFF]/u);
    }
  });
});
