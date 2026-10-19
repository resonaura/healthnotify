const BOT_TOKEN_REGEX = /\d+:[A-Za-z0-9_-]{30,}/gu;

export function maskSecrets(message: string): string {
  return message.replace(BOT_TOKEN_REGEX, "[REDACTED_BOT_TOKEN]");
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  constructor(private readonly context: string = "App") {}

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  public error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails =
      error instanceof Error
        ? { errorMessage: error.message, errorStack: error.stack }
        : error !== undefined
          ? { error }
          : {};
    this.log("error", message, { ...errorDetails, ...meta });
  }

  public forContext(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const safeMessage = maskSecrets(message);
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]: ${safeMessage}`;

    if (meta && Object.keys(meta).length > 0) {
      const sanitizedMeta = JSON.stringify(meta, (_key, value) => {
        if (typeof value === "string") return maskSecrets(value);
        return value;
      });
      if (level === "error") {
        console.error(`${prefix} ${sanitizedMeta}`);
      } else if (level === "warn") {
        console.warn(`${prefix} ${sanitizedMeta}`);
      } else {
        console.log(`${prefix} ${sanitizedMeta}`);
      }
    } else {
      if (level === "error") {
        console.error(prefix);
      } else if (level === "warn") {
        console.warn(prefix);
      } else {
        console.log(prefix);
      }
    }
  }
}

export const logger = new Logger("HealthNotify");
