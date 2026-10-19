import { describe, expect, it } from "vitest";
import { isAdmin, readEnv } from "./env.js";

describe("env configuration", () => {
  const validMockEnv = {
    TG_BOT_TOKEN: "1234567890:AAFakeMockTokenForTestingPurposes00000",
    TG_ADMIN_USER_IDS: "359079621, 261171441",
    DEFAULT_GROUP_CHAT_ID: "4301185075",
    DEFAULT_RECIPIENT_USER_ID: "915156343",
    DEFAULT_TIMEZONE: "America/Vancouver",
    DEFAULT_LOCALE: "ru",
  };

  it("parses valid configuration successfully", () => {
    const config = readEnv(validMockEnv);
    expect(config.TG_BOT_TOKEN).toBe("1234567890:AAFakeMockTokenForTestingPurposes00000");
    expect(config.TG_ADMIN_USER_IDS).toEqual([359079621, 261171441]);
    expect(config.DEFAULT_GROUP_CHAT_ID).toBe(-1004301185075);
    expect(config.DEFAULT_RECIPIENT_USER_ID).toBe(915156343);
    expect(config.DEFAULT_TIMEZONE).toBe("America/Vancouver");
    expect(config.DEFAULT_LOCALE).toBe("ru");
    expect(config.SCHEDULER_INTERVAL_SECONDS).toBe(10);
    expect(config.CATCH_UP_WINDOW_MINUTES).toBe(60);
    expect(config.DEFAULT_SNOOZE_INTERVALS).toEqual([5, 10, 20, 40, 60]);
    expect(config.DEFAULT_AUTO_REPEAT_INTERVALS).toEqual([5, 10, 20, 40]);
  });

  it("normalizes negative group IDs correctly", () => {
    const config = readEnv({
      ...validMockEnv,
      DEFAULT_GROUP_CHAT_ID: "-1004301185075",
    });
    expect(config.DEFAULT_GROUP_CHAT_ID).toBe(-1004301185075);
  });

  it("checks admin authorization correctly", () => {
    const config = readEnv(validMockEnv);
    expect(isAdmin(359079621, config)).toBe(true);
    expect(isAdmin(261171441, config)).toBe(true);
    expect(isAdmin(999999999, config)).toBe(false);
  });

  it("rejects invalid bot token format", () => {
    expect(() =>
      readEnv({
        ...validMockEnv,
        TG_BOT_TOKEN: "invalid_token",
      }),
    ).toThrow();
  });

  it("rejects invalid IANA timezone", () => {
    expect(() =>
      readEnv({
        ...validMockEnv,
        DEFAULT_TIMEZONE: "Invalid/Fake_Zone",
      }),
    ).toThrow();
  });

  it("rejects empty admin user IDs", () => {
    expect(() =>
      readEnv({
        ...validMockEnv,
        TG_ADMIN_USER_IDS: "",
      }),
    ).toThrow();
  });
});
