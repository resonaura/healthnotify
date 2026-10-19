import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { makeDataSource } from "../../src/persistence/data-source.js";
import {
  HealthMeasurement,
  ReminderDefinition,
  ReminderEvent,
  ReminderOccurrence,
} from "../../src/persistence/entities/index.js";
import { HistoryService } from "../../src/services/history.service.js";
import { ReminderService } from "../../src/services/reminder.service.js";

describe("ReminderService Unit", () => {
  let dataSource: DataSource;
  let service: ReminderService;

  beforeAll(async () => {
    dataSource = makeDataSource(":memory:");
    await dataSource.initialize();
    await dataSource.runMigrations();

    const eventRepo = dataSource.getRepository(ReminderEvent);
    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const measRepo = dataSource.getRepository(HealthMeasurement);
    const defRepo = dataSource.getRepository(ReminderDefinition);

    const historyService = new HistoryService(eventRepo, occRepo, measRepo);
    service = new ReminderService(defRepo, occRepo, historyService);
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("creates, retrieves, and lists reminders with active status filter", async () => {
    const def = await service.createReminder(
      {
        title: "Morning Pills",
        targetUserIds: [915156343],
        destinationChatId: -1004301185075,
        scheduleType: "daily",
        timesOfDay: ["08:00"],
        startDate: "2026-10-19",
        endDate: "2026-10-21",
      },
      359079621,
    );

    expect(def.id).toBeDefined();
    expect(def.activeStatus).toBe("active");

    const fetched = await service.getReminder(def.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("Morning Pills");

    const activeList = await service.listReminders("active");
    expect(activeList.some((r) => r.id === def.id)).toBe(true);

    const allList = await service.listReminders();
    expect(allList.some((r) => r.id === def.id)).toBe(true);
  });

  it("handles pause, resume, and delete with non-existent and existing reminders", async () => {
    // Non-existent reminder operations return false
    expect(await service.pauseReminder(99999, 359079621)).toBe(false);
    expect(await service.resumeReminder(99999, 359079621)).toBe(false);
    expect(await service.deleteReminder(99999, 359079621)).toBe(false);

    const def = await service.createReminder(
      {
        title: "Test Reminder",
        targetUserIds: [915156343],
        destinationChatId: -1004301185075,
        scheduleType: "daily",
        timesOfDay: ["12:00"],
        startDate: "2026-10-19",
      },
      359079621,
    );

    // Pause reminder
    const paused = await service.pauseReminder(def.id, 359079621);
    expect(paused).toBe(true);
    const defPaused = await service.getReminder(def.id);
    expect(defPaused?.activeStatus).toBe("paused");

    // When paused, populateOccurrencesForDefinition should be a no-op
    const addedCount = await service.populateOccurrencesForDefinition(defPaused!);
    expect(addedCount).toBe(0);

    // Resume reminder
    const resumed = await service.resumeReminder(def.id, 359079621);
    expect(resumed).toBe(true);
    const defResumed = await service.getReminder(def.id);
    expect(defResumed?.activeStatus).toBe("active");

    // Delete (archive) reminder
    const deleted = await service.deleteReminder(def.id, 359079621);
    expect(deleted).toBe(true);
    const defDeleted = await service.getReminder(def.id);
    expect(defDeleted?.activeStatus).toBe("archived");
  });
});
