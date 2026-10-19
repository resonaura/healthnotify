import "reflect-metadata";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DataSource } from "typeorm";
import { readEnv } from "../config/env.js";
import {
  AppSetting,
  BotUser,
  DeliveryAttempt,
  HealthMeasurement,
  RegisteredChat,
  ReminderDefinition,
  ReminderEvent,
  ReminderOccurrence,
} from "./entities/index.js";
import { InitialSchema1700000000001 } from "./migrations/001_initial_schema.js";

export const ALL_ENTITIES = [
  AppSetting,
  BotUser,
  RegisteredChat,
  ReminderDefinition,
  ReminderOccurrence,
  DeliveryAttempt,
  ReminderEvent,
  HealthMeasurement,
];

export const ALL_MIGRATIONS = [InitialSchema1700000000001];

export function makeDataSource(
  databaseFile?: string,
  options: { synchronize?: boolean; logging?: boolean } = {},
): DataSource {
  const rawFile = databaseFile || readEnv().DATABASE_FILE;
  const dbPath = rawFile === ":memory:" ? ":memory:" : resolve(rawFile);
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  }

  return new DataSource({
    type: "better-sqlite3",
    database: dbPath,
    entities: ALL_ENTITIES,
    migrations: ALL_MIGRATIONS,
    synchronize: options.synchronize ?? false,
    logging: options.logging ?? false,
    prepareDatabase: (database) => {
      const sqlite = database as { pragma: (statement: string) => unknown };
      if (dbPath !== ":memory:") {
        sqlite.pragma("journal_mode = WAL");
        sqlite.pragma("synchronous = NORMAL");
      }
      sqlite.pragma("foreign_keys = ON");
      sqlite.pragma("busy_timeout = 5000");
    },
  });
}

let dataSourceSingleton: DataSource | null = null;

export async function getDataSource(databaseFile?: string): Promise<DataSource> {
  if (dataSourceSingleton?.isInitialized) {
    return dataSourceSingleton;
  }
  dataSourceSingleton = makeDataSource(databaseFile);
  await dataSourceSingleton.initialize();
  await dataSourceSingleton.runMigrations();
  return dataSourceSingleton;
}

export async function closeDataSource(): Promise<void> {
  if (dataSourceSingleton?.isInitialized) {
    await dataSourceSingleton.destroy();
    dataSourceSingleton = null;
  }
}
