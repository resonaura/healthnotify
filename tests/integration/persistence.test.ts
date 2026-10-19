import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { makeDataSource } from "../../src/persistence/data-source.js";
import {
  AppSetting,
  BotUser,
  ReminderDefinition,
  ReminderOccurrence,
} from "../../src/persistence/entities/index.js";
import { SettingsStore } from "../../src/persistence/settings.store.js";

describe("Persistence & Migrations Integration", () => {
  let dataSource: DataSource;
  let settingsStore: SettingsStore;

  beforeAll(async () => {
    dataSource = makeDataSource(":memory:");
    await dataSource.initialize();
    await dataSource.runMigrations();
    settingsStore = new SettingsStore(dataSource.getRepository(AppSetting));
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("applies migrations and exposes all tables", async () => {
    const runner = dataSource.createQueryRunner();
    const tables = (await runner.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
    )) as Array<{ name: string }>;
    await runner.release();

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("app_settings");
    expect(tableNames).toContain("bot_users");
    expect(tableNames).toContain("registered_chats");
    expect(tableNames).toContain("reminder_definitions");
    expect(tableNames).toContain("reminder_occurrences");
    expect(tableNames).toContain("delivery_attempts");
    expect(tableNames).toContain("reminder_events");
    expect(tableNames).toContain("health_measurements");
  });

  it("works with SettingsStore for settings, language, menu, and wizard draft", async () => {
    const userId = 359079621;

    expect(await settingsStore.getUserLanguage(userId)).toBe("ru");
    await settingsStore.setUserLanguage(userId, "en");
    expect(await settingsStore.getUserLanguage(userId)).toBe("en");

    expect(await settingsStore.getUserMenu(userId)).toBe("MainMenu");
    await settingsStore.setUserMenu(userId, "RemindersMenu");
    expect(await settingsStore.getUserMenu(userId)).toBe("RemindersMenu");

    expect(await settingsStore.getWizardDraft(userId)).toBeNull();
    const sampleDraft = { title: "Check blood pressure", times: ["06:00", "20:00"] };
    await settingsStore.setWizardDraft(userId, sampleDraft);
    expect(await settingsStore.getWizardDraft(userId)).toEqual(sampleDraft);

    await settingsStore.clearWizardDraft(userId);
    expect(await settingsStore.getWizardDraft(userId)).toBeNull();
  });

  it("creates and retrieves users with roles", async () => {
    const userRepo = dataSource.getRepository(BotUser);
    const user = userRepo.create({
      id: 915156343,
      firstName: "Father",
      role: "USER",
      dmActive: true,
      language: "ru",
    });
    await userRepo.save(user);

    const found = await userRepo.findOneBy({ id: 915156343 });
    expect(found).not.toBeNull();
    expect(found?.firstName).toBe("Father");
    expect(found?.role).toBe("USER");
    expect(found?.dmActive).toBe(true);
  });

  it("enforces unique constraint on occurrence (definition, target, plannedTime)", async () => {
    const defRepo = dataSource.getRepository(ReminderDefinition);
    const occRepo = dataSource.getRepository(ReminderOccurrence);

    const def = defRepo.create({
      title: "Blood Pressure Daily",
      category: "measurement",
      createdByUserId: 359079621,
      targetUserIdsJson: JSON.stringify([915156343]),
      destinationChatId: -1004301185075,
      destinationType: "group",
      scheduleType: "daily",
      timesOfDayJson: JSON.stringify(["06:00", "20:00"]),
      startDate: "2026-10-19",
      timezone: "Europe/Moscow",
    });
    const savedDef = await defRepo.save(def);

    const plannedDate = new Date("2026-10-19T03:00:00.000Z"); // 06:00 MSK

    const occ1 = occRepo.create({
      id: "occ-1111",
      reminderDefinitionId: savedDef.id,
      targetUserId: 915156343,
      plannedAtUtc: plannedDate,
      dueAtUtc: plannedDate,
      status: "SCHEDULED",
    });
    await occRepo.save(occ1);

    const occDuplicate = occRepo.create({
      id: "occ-2222",
      reminderDefinitionId: savedDef.id,
      targetUserId: 915156343,
      plannedAtUtc: plannedDate,
      dueAtUtc: plannedDate,
      status: "SCHEDULED",
    });

    await expect(occRepo.save(occDuplicate)).rejects.toThrow();
  });
});
