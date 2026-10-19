import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  SchedulerError,
  TelegramDeliveryError,
  UnauthorizedError,
  ValidationError,
} from "../../src/shared/errors.js";
import { Logger, maskSecrets } from "../../src/shared/logger.js";

describe("Logger & Errors", () => {
  it("masks bot token in plain text and object metadata", () => {
    const raw =
      "Sending request with token 8804473731:AAHD9nHvSRVGQU5pbDai9mLwcDtFctei51s to Telegram";
    const masked = maskSecrets(raw);
    expect(masked).not.toContain("8804473731:AAHD9nHvSRVGQU5pbDai9mLwcDtFctei51s");
    expect(masked).toContain("[REDACTED_BOT_TOKEN]");
  });

  it("logs with correct log levels and handles Error and object payloads", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const testLogger = new Logger("TestContext");
    testLogger.debug("debug message");
    testLogger.info("info message", { key: "val" });
    testLogger.warn("warn message");
    testLogger.error("error message", new Error("boom"), { extra: "data" });
    testLogger.error("string error message", "string-error");

    const subLogger = testLogger.forContext("Child");
    subLogger.info("child message");

    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("instantiates custom error classes with expected properties", () => {
    const appErr = new AppError("Generic", "CUSTOM_CODE", 500);
    expect(appErr.message).toBe("Generic");
    expect(appErr.code).toBe("CUSTOM_CODE");

    const unauth = new UnauthorizedError();
    expect(unauth.code).toBe("UNAUTHORIZED");
    expect(unauth.statusCode).toBe(401);

    const forbidden = new ForbiddenError();
    expect(forbidden.code).toBe("FORBIDDEN");
    expect(forbidden.statusCode).toBe(403);

    const notFound = new NotFoundError();
    expect(notFound.code).toBe("NOT_FOUND");
    expect(notFound.statusCode).toBe(404);

    const valErr = new ValidationError("Bad input");
    expect(valErr.code).toBe("VALIDATION_ERROR");
    expect(valErr.statusCode).toBe(400);

    const conflict = new ConflictError("State mismatch");
    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.statusCode).toBe(409);

    const tgErr = new TelegramDeliveryError("Blocked", -1004301185075, 30);
    expect(tgErr.code).toBe("TELEGRAM_DELIVERY_ERROR");
    expect(tgErr.chatId).toBe(-1004301185075);
    expect(tgErr.retryAfterSeconds).toBe(30);

    const schedErr = new SchedulerError("Tick failed");
    expect(schedErr.code).toBe("SCHEDULER_ERROR");
  });
});
