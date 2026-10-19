import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { makeDataSource } from "../../src/persistence/data-source.js";
import {
  HealthMeasurement,
  ReminderEvent,
  ReminderOccurrence,
} from "../../src/persistence/entities/index.js";
import { HistoryService } from "../../src/services/history.service.js";

describe("HistoryService Unit", () => {
  let dataSource: DataSource;
  let service: HistoryService;

  beforeAll(async () => {
    dataSource = makeDataSource(":memory:");
    await dataSource.initialize();
    await dataSource.runMigrations();

    const eventRepo = dataSource.getRepository(ReminderEvent);
    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const measRepo = dataSource.getRepository(HealthMeasurement);
    service = new HistoryService(eventRepo, occRepo, measRepo);
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("logs reminder events and records health measurements", async () => {
    const event = await service.logEvent("occ-1", 10, 915156343, 359079621, "completed", {
      note: "Done quickly",
    });
    expect(event.id).toBeDefined();
    expect(event.eventType).toBe("completed");

    const measurement = await service.recordMeasurement(
      915156343,
      "blood_pressure",
      { systolic: 120, diastolic: 80, pulse: 72 },
      "occ-1",
      "Normal reading",
    );
    expect(measurement.id).toBeDefined();
    expect(measurement.measurementType).toBe("blood_pressure");

    const measurements = await service.listUserMeasurements(915156343);
    expect(measurements).toHaveLength(1);
    expect(measurements[0]?.note).toBe("Normal reading");
  });

  it("computes compliance statistics accurately with filters and edge cases", async () => {
    const occRepo = dataSource.getRepository(ReminderOccurrence);

    // Empty stats: completion rate defaults to 100%
    const emptyStats = await service.getComplianceStats(999999);
    expect(emptyStats.totalOccurrences).toBe(0);
    expect(emptyStats.completionRate).toBe(100);

    // Create 4 occurrences: 2 COMPLETED, 1 SKIPPED, 1 MISSED
    const occ1 = occRepo.create({
      id: "occ-stat-1",
      reminderDefinitionId: 1,
      targetUserId: 100,
      plannedAtUtc: new Date("2026-10-19T06:00:00Z"),
      dueAtUtc: new Date("2026-10-19T06:00:00Z"),
      status: "COMPLETED",
      snoozeCount: 2,
    });
    const occ2 = occRepo.create({
      id: "occ-stat-2",
      reminderDefinitionId: 1,
      targetUserId: 100,
      plannedAtUtc: new Date("2026-10-19T10:00:00Z"),
      dueAtUtc: new Date("2026-10-19T10:00:00Z"),
      status: "COMPLETED",
      snoozeCount: 0,
    });
    const occ3 = occRepo.create({
      id: "occ-stat-3",
      reminderDefinitionId: 1,
      targetUserId: 100,
      plannedAtUtc: new Date("2026-10-19T14:00:00Z"),
      dueAtUtc: new Date("2026-10-19T14:00:00Z"),
      status: "SKIPPED",
      snoozeCount: 1,
    });
    const occ4 = occRepo.create({
      id: "occ-stat-4",
      reminderDefinitionId: 1,
      targetUserId: 100,
      plannedAtUtc: new Date("2026-10-19T18:00:00Z"),
      dueAtUtc: new Date("2026-10-19T18:00:00Z"),
      status: "MISSED",
      snoozeCount: 0,
    });

    await occRepo.save([occ1, occ2, occ3, occ4]);

    const stats = await service.getComplianceStats(100);
    expect(stats.totalOccurrences).toBe(4);
    expect(stats.completed).toBe(2);
    expect(stats.skipped).toBe(1);
    expect(stats.missed).toBe(1);
    expect(stats.snoozes).toBe(3);
    // Evaluated: 2 completed / 4 total = 50%
    expect(stats.completionRate).toBe(50);

    // List user history
    const history = await service.listUserHistory(100);
    expect(history).toHaveLength(4);
  });

  it("deletes user health measurements for GDPR compliance", async () => {
    await service.recordMeasurement(777, "weight", { kg: 75 });
    expect(await service.listUserMeasurements(777)).toHaveLength(1);

    await service.deleteUserHealthData(777);
    expect(await service.listUserMeasurements(777)).toHaveLength(0);
  });
});
