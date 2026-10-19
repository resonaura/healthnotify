import "reflect-metadata";
import { config as loadDotEnv } from "dotenv";
import { createApp } from "./app.js";
import { logger } from "./shared/logger.js";

loadDotEnv();

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.start();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    try {
      await app.stop();
      process.exit(0);
    } catch (err) {
      logger.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  logger.error("Fatal error during bootstrap:", err);
  process.exit(1);
});
