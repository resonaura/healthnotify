import { Bot } from "grammy";
import type { AppEnv } from "../config/env.js";

export function createBot(env: AppEnv): Bot {
  return new Bot(env.TG_BOT_TOKEN);
}
