import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { makeDataSource } from "../../src/persistence/data-source.js";
import {
  BotUser,
  DeliveryAttempt,
  HealthMeasurement,
  ReminderDefinition,
  ReminderEvent,
  ReminderOccurrence,
} from "../../src/persistence/entities/index.js";
import { SchedulerRecovery } from "../../src/scheduler/recovery.js";
import { SchedulerWorker } from "../../src/scheduler/worker.js";
import { DeliveryService, type TelegramApi } from "../../src/services/delivery.service.js";
import { HistoryService } from "../../src/services/history.service.js";
import { OccurrenceService } from "../../src/services/occurrence.service.js";
import { ReminderService } from "../../src/services/reminder.service.js";

class MockTelegramApi implements TelegramApi {
  public sentMessages: Array<{
    chatId: number;
    text: string;
    options?: Record<string, unknown> | undefined;
    messageId: number;
  }> = [];
  public editedTexts: Array<{ chatId: number; messageId: number; text: string }> = [];
  public clearedMarkups: Array<{ chatId: number; messageId: number }> = [];
  private nextMessageId = 1000;

  public async sendMessage(
    chatId: number,
    text: string,
    options?: Record<string, unknown>,
  ): Promise<{ message_id: number }> {
    const messageId = ++this.nextMessageId;
    this.sentMessages.push({ chatId, text, options, messageId });
    return { message_id: messageId };
  }

  public async editMessageText(chatId: number, messageId: number, text: string): Promise<unknown> {
    this.editedTexts.push({ chatId, messageId, text });
    return { ok: true };
  }

  public async editMessageReplyMarkup(chatId: number, messageId: number): Promise<unknown> {
    this.clearedMarkups.push({ chatId, messageId });
    return { ok: true };
  }
}

describe("Scheduler & Occurrence Integration", () => {
  let dataSource: DataSource;
  let mockApi: MockTelegramApi;
  let deliveryService: DeliveryService;
  let historyService: HistoryService;
  let reminderService: ReminderService;
  let occurrenceService: OccurrenceService;
  let recovery: SchedulerRecovery;
  let worker: SchedulerWorker;

  const adminId = 359079621;
  const fatherId = 915156343;
  const groupChatId = -1004301185075;

  beforeEach(async () => {
    dataSource = makeDataSource(":memory:");
    await dataSource.initialize();
    await dataSource.runMigrations();

    mockApi = new MockTelegramApi();
    deliveryService = new DeliveryService(mockApi);

    const eventRepo = dataSource.getRepository(ReminderEvent);
    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const defRepo = dataSource.getRepository(ReminderDefinition);
    const userRepo = dataSource.getRepository(BotUser);
    const attemptRepo = dataSource.getRepository(DeliveryAttempt);
    const measRepo = dataSource.getRepository(HealthMeasurement);

    historyService = new HistoryService(eventRepo, occRepo, measRepo);
    reminderService = new ReminderService(defRepo, occRepo, historyService);
    occurrenceService = new OccurrenceService(
      occRepo,
      defRepo,
      userRepo,
      attemptRepo,
      deliveryService,
      historyService,
    );
    recovery = new SchedulerRecovery(occRepo, occurrenceService, deliveryService, historyService);
    worker = new SchedulerWorker(occurrenceService, recovery, 10, 60);

    // Seed father user
    await userRepo.save(
      userRepo.create({
        id: fatherId,
        firstName: "Father",
        username: "father_user",
        role: "USER",
        dmActive: true,
        language: "ru",
      }),
    );
  });

  afterEach(async () => {
    await worker.stop();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("executes complete lifecycle: scheduled -> delivered -> snoozed -> snooze fired -> completed", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Measure Blood Pressure",
        targetUserIds: [fatherId],
        destinationChatId: groupChatId,
        destinationType: "group",
        scheduleType: "daily",
        timesOfDay: ["06:00"],
        timezone: "Europe/Moscow",
        startDate: "2026-10-19",
        endDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = await occRepo.findOneBy({ reminderDefinitionId: def.id });
    expect(occ).not.toBeNull();
    expect(occ?.status).toBe("SCHEDULED");

    // 1. Tick at planned time (06:00 MSK = 03:00 UTC)
    const plannedTimeUtc = new Date("2026-10-19T03:00:00.000Z");
    const processed = await worker.tick(plannedTimeUtc);
    expect(processed).toBe(1);

    const deliveredOcc = await occRepo.findOneBy({ id: occ!.id });
    expect(deliveredOcc?.status).toBe("PENDING");
    expect(deliveredOcc?.activeMessageId).toBeGreaterThan(0);
    expect(mockApi.sentMessages).toHaveLength(1);
    expect(mockApi.sentMessages[0]?.text).toContain("@father_user");
    expect(mockApi.sentMessages[0]?.text).toContain("Measure Blood Pressure");

    // 2. User presses [Later] at 06:01
    const snoozeClickTime = new Date("2026-10-19T03:01:00.000Z");
    const snoozeResult = await occurrenceService.handleUserAction(
      occ!.id,
      "snooze",
      fatherId,
      snoozeClickTime,
    );
    expect(snoozeResult.success).toBe(true);

    const snoozedOcc = await occRepo.findOneBy({ id: occ!.id });
    expect(snoozedOcc?.status).toBe("SNOOZED");
    expect(snoozedOcc?.snoozeCount).toBe(1);
    expect(snoozedOcc?.snoozedUntilUtc).toEqual(new Date("2026-10-19T03:06:00.000Z")); // +5m

    // Card should be updated to show snoozed status while keeping Done & Skip
    expect(mockApi.editedTexts).toHaveLength(1);
    expect(mockApi.editedTexts[0]?.text).toContain("Отложено");

    // 3. Time reaches snooze due time (03:06 UTC) -> Worker ticks!
    const snoozeDueTime = new Date("2026-10-19T03:06:00.000Z");
    await worker.tick(snoozeDueTime);

    // Old buttons deactivated and fresh card sent
    expect(mockApi.clearedMarkups).toHaveLength(1);
    expect(mockApi.sentMessages).toHaveLength(2);

    const resnoozedOcc = await occRepo.findOneBy({ id: occ!.id });
    expect(resnoozedOcc?.status).toBe("PENDING");

    // 4. User presses [Done] at 06:07
    const doneClickTime = new Date("2026-10-19T03:07:00.000Z");
    const doneResult = await occurrenceService.handleUserAction(
      occ!.id,
      "done",
      fatherId,
      doneClickTime,
    );
    expect(doneResult.success).toBe(true);

    const completedOcc = await occRepo.findOneBy({ id: occ!.id });
    expect(completedOcc?.status).toBe("COMPLETED");
    expect(completedOcc?.completedAtUtc).toEqual(doneClickTime);
  });

  it("handles auto-repeat progression and declares MISSED when limits exhausted", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Evening Pill",
        targetUserIds: [fatherId],
        destinationChatId: groupChatId,
        scheduleType: "once",
        timesOfDay: ["20:00"],
        timezone: "Europe/Moscow",
        startDate: "2026-10-19",
        autoRepeatIntervals: [5, 10],
        maxAutoRepeatCount: 2,
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;

    // Initial send at 17:00 UTC (20:00 MSK)
    const t0 = new Date("2026-10-19T17:00:00.000Z");
    await worker.tick(t0);
    expect((await occRepo.findOneBy({ id: occ.id }))?.status).toBe("PENDING");
    expect(mockApi.sentMessages).toHaveLength(1);

    // Repeat 1 at 17:05 UTC (+5m)
    const t1 = new Date("2026-10-19T17:05:00.000Z");
    await worker.tick(t1);
    const occRep1 = (await occRepo.findOneBy({ id: occ.id }))!;
    expect(occRep1.status).toBe("PENDING");
    expect(occRep1.repeatCount).toBe(1);
    expect(mockApi.sentMessages).toHaveLength(2);

    // Repeat 2 at 17:15 UTC (+10m)
    const t2 = new Date("2026-10-19T17:15:00.000Z");
    await worker.tick(t2);
    const occRep2 = (await occRepo.findOneBy({ id: occ.id }))!;
    expect(occRep2.status).toBe("PENDING");
    expect(occRep2.repeatCount).toBe(2);
    expect(mockApi.sentMessages).toHaveLength(3);

    // Max repeats reached -> next tick declares MISSED
    const t3 = new Date("2026-10-19T17:25:00.000Z");
    await worker.tick(t3);
    const occMissed = (await occRepo.findOneBy({ id: occ.id }))!;
    expect(occMissed.status).toBe("MISSED");
  });

  it("handles consecutive occurrence: closes unhandled morning occurrence when evening arrives", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Blood Pressure Twice Daily",
        targetUserIds: [fatherId],
        destinationChatId: groupChatId,
        scheduleType: "daily",
        timesOfDay: ["06:00", "20:00"],
        timezone: "Europe/Moscow",
        startDate: "2026-10-19",
        endDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occs = await occRepo.find({
      where: { reminderDefinitionId: def.id },
      order: { plannedAtUtc: "ASC" },
    });
    expect(occs).toHaveLength(2);
    const morningOcc = occs[0]!;
    const eveningOcc = occs[1]!;

    // 1. Deliver morning occurrence at 03:00 UTC
    await worker.tick(morningOcc.plannedAtUtc);
    expect((await occRepo.findOneBy({ id: morningOcc.id }))?.status).toBe("PENDING");

    // Morning occurrence was ignored and remains PENDING
    // 2. Evening occurrence arrives at 17:00 UTC
    await worker.tick(eveningOcc.plannedAtUtc);

    const morningAfter = (await occRepo.findOneBy({ id: morningOcc.id }))!;
    const eveningAfter = (await occRepo.findOneBy({ id: eveningOcc.id }))!;

    // Morning occurrence must have been closed as MISSED by consecutive occurrence policy
    expect(morningAfter.status).toBe("MISSED");
    // Evening occurrence is now the active PENDING reminder
    expect(eveningAfter.status).toBe("PENDING");
  });

  it("performs catch-up recovery: delivers recent overdue, expires excessively late", async () => {
    const occRepo = dataSource.getRepository(ReminderOccurrence);

    const recentOverdue = occRepo.create({
      id: "recent-1",
      reminderDefinitionId: 999,
      targetUserId: fatherId,
      plannedAtUtc: new Date(Date.now() - 20 * 60 * 1000), // 20 min ago
      dueAtUtc: new Date(Date.now() - 20 * 60 * 1000),
      status: "SCHEDULED",
    });

    const wayTooLate = occRepo.create({
      id: "late-1",
      reminderDefinitionId: 999,
      targetUserId: fatherId,
      plannedAtUtc: new Date(Date.now() - 300 * 60 * 1000), // 5 hours ago
      dueAtUtc: new Date(Date.now() - 300 * 60 * 1000),
      status: "SCHEDULED",
      activeMessageChatId: groupChatId,
      activeMessageId: 8888,
    });

    const lateWithOnlyChat = occRepo.create({
      id: "late-2",
      reminderDefinitionId: 999,
      targetUserId: fatherId,
      plannedAtUtc: new Date(Date.now() - 310 * 60 * 1000),
      dueAtUtc: new Date(Date.now() - 310 * 60 * 1000),
      status: "SCHEDULED",
      activeMessageChatId: groupChatId,
      activeMessageId: null,
    });

    await occRepo.save([recentOverdue, wayTooLate, lateWithOnlyChat]);

    const result = await recovery.reconcileOverdueOccurrences(60); // 60 min catch-up window
    expect(result.expiredMissedCount).toBe(2);

    const lateAfter = await occRepo.findOneBy({ id: "late-1" });
    expect(lateAfter?.status).toBe("MISSED");
    expect(mockApi.clearedMarkups).toHaveLength(1);

    // Also verify catch block if processDueOccurrence throws
    const errorOcc = occRepo.create({
      id: "err-occ",
      reminderDefinitionId: 999,
      targetUserId: fatherId,
      plannedAtUtc: new Date(Date.now() - 10 * 60 * 1000),
      dueAtUtc: new Date(Date.now() - 10 * 60 * 1000),
      status: "SCHEDULED",
    });
    await occRepo.save(errorOcc);
    const mockProcess = vi
      .spyOn(occurrenceService, "processDueOccurrence")
      .mockRejectedValueOnce(new Error("Delivery failed"));
    await recovery.reconcileOverdueOccurrences(60);
    mockProcess.mockRestore();
  });
});
