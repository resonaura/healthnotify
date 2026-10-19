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
import { ConflictError, ForbiddenError, NotFoundError } from "../../src/shared/errors.js";
import { DeliveryService, type TelegramApi } from "../../src/services/delivery.service.js";
import { HistoryService } from "../../src/services/history.service.js";
import { OccurrenceService } from "../../src/services/occurrence.service.js";
import { ReminderService } from "../../src/services/reminder.service.js";
import { formatTimeInZone, localTimeToUtc } from "../../src/shared/time.js";

class FailingTelegramApi implements TelegramApi {
  public failAll = false;
  public sentMessages: Array<{ chatId: number; text: string }> = [];

  public async sendMessage(chatId: number, text: string): Promise<{ message_id: number }> {
    if (this.failAll) {
      throw new Error("403 Forbidden: bot was blocked by the user");
    }
    this.sentMessages.push({ chatId, text });
    return { message_id: 1234 };
  }

  public async editMessageText(): Promise<unknown> {
    if (this.failAll) throw new Error("403 Forbidden: bot was blocked by the user");
    return { ok: true };
  }

  public async editMessageReplyMarkup(): Promise<unknown> {
    return { ok: true };
  }
}

describe("Edge Cases & Hardening Integration", () => {
  let dataSource: DataSource;
  let mockApi: FailingTelegramApi;
  let deliveryService: DeliveryService;
  let historyService: HistoryService;
  let reminderService: ReminderService;
  let occurrenceService: OccurrenceService;

  const adminId = 359079621;
  const fatherId = 915156343;
  const unauthorizedUserId = 123456789;

  beforeEach(async () => {
    dataSource = makeDataSource(":memory:");
    await dataSource.initialize();
    await dataSource.runMigrations();

    mockApi = new FailingTelegramApi();
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

    // Seed father with no username
    await userRepo.save(
      userRepo.create({
        id: fatherId,
        firstName: "Father",
        lastName: "Smith",
        username: null,
        role: "USER",
        dmActive: true,
        language: "ru",
      }),
    );
  });

  afterEach(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("handles double-click race conditions by rejecting second click with ConflictError", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Take Blood Pressure",
        targetUserIds: [fatherId],
        destinationChatId: fatherId,
        scheduleType: "once",
        timesOfDay: ["08:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;

    // Initial delivery
    await occurrenceService.processDueOccurrence(occ.id);

    // First click: [Done] -> succeeds
    const res1 = await occurrenceService.handleUserAction(occ.id, "done", fatherId);
    expect(res1.success).toBe(true);

    // Second click: [Done] -> rejected with ConflictError
    await expect(occurrenceService.handleUserAction(occ.id, "done", fatherId)).rejects.toThrow(
      ConflictError,
    );

    // Third click: [Skip] -> also rejected with ConflictError
    await expect(occurrenceService.handleUserAction(occ.id, "skip", fatherId)).rejects.toThrow(
      ConflictError,
    );
  });

  it("strictly forbids actions taken by unauthorized users with ForbiddenError", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Personal Pills",
        targetUserIds: [fatherId],
        destinationChatId: -1004301185075, // Family group
        scheduleType: "once",
        timesOfDay: ["09:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;
    await occurrenceService.processDueOccurrence(occ.id);

    // Unauthorized user in group tries to click button
    await expect(
      occurrenceService.handleUserAction(occ.id, "done", unauthorizedUserId),
    ).rejects.toThrow(ForbiddenError);
  });

  it("handles bot blocked / Telegram delivery failures gracefully without crashing", async () => {
    mockApi.failAll = true;

    const def = await reminderService.createReminder(
      {
        title: "Check Glucose",
        targetUserIds: [fatherId],
        destinationChatId: fatherId,
        scheduleType: "once",
        timesOfDay: ["07:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;

    // processDueOccurrence should not throw an unhandled error
    await expect(occurrenceService.processDueOccurrence(occ.id)).resolves.toBeUndefined();

    // Delivery attempt must be logged as failed in DB
    const attemptRepo = dataSource.getRepository(DeliveryAttempt);
    const attempts = await attemptRepo.find({ where: { occurrenceId: occ.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe("failed");
    expect(attempts[0]?.errorMessage).toContain("bot was blocked");
  });

  it("formats Markdown user mention link correctly when user has no username", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Evening Pressure",
        targetUserIds: [fatherId],
        destinationChatId: -1004301185075,
        scheduleType: "once",
        timesOfDay: ["20:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;
    await occurrenceService.processDueOccurrence(occ.id);

    expect(mockApi.sentMessages).toHaveLength(1);
    // Should format [Father Smith](tg://user?id=915156343)
    expect(mockApi.sentMessages[0]?.text).toContain(`[Father Smith](tg://user?id=${fatherId})`);
  });

  it("handles non-existent occurrence or reminder definition in handleUserAction", async () => {
    await expect(
      occurrenceService.handleUserAction("non-existent-id", "done", fatherId),
    ).rejects.toThrow(NotFoundError);
  });

  it("correctly handles timezone conversions and midnight boundary crossovers", () => {
    // 00:30 MSK (UTC+3) on 2026-10-20 is 21:30 UTC on 2026-10-19 (previous day in UTC!)
    const utcDate = localTimeToUtc("2026-10-20", "00:30", "Europe/Moscow");
    expect(utcDate.toISOString()).toBe("2026-10-19T21:30:00.000Z");

    const backToLocal = formatTimeInZone(utcDate, "Europe/Moscow");
    expect(backToLocal).toBe("00:30");
  });

  it("handles max snooze limit reached by returning rejection message without advancing count", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Quick Check",
        targetUserIds: [fatherId],
        destinationChatId: fatherId,
        scheduleType: "once",
        timesOfDay: ["15:00"],
        startDate: "2026-10-19",
        maxSnoozeCount: 1, // Only 1 snooze allowed
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;
    await occurrenceService.processDueOccurrence(occ.id);

    // Snooze 1: should succeed
    const res1 = await occurrenceService.handleUserAction(occ.id, "snooze", fatherId);
    expect(res1.success).toBe(true);

    // Snooze 2: should be rejected
    const res2 = await occurrenceService.handleUserAction(occ.id, "snooze", fatherId);
    expect(res2.success).toBe(false);
    expect(res2.message).toContain("Maximum snooze limit reached");
  });

  it("rejects actions clicked on outdated cards when a newer message was delivered", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Freshness Test",
        targetUserIds: [fatherId],
        destinationChatId: fatherId,
        scheduleType: "once",
        timesOfDay: ["12:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;

    // Initial delivery: messageId 1234
    await occurrenceService.processDueOccurrence(occ.id);
    const freshOcc = (await occRepo.findOneBy({ id: occ.id }))!;
    expect(freshOcc.activeMessageId).toBe(1234);

    // Simulate an auto-repeat or snooze re-send where messageId becomes 5678
    freshOcc.activeMessageId = 5678;
    await occRepo.save(freshOcc);

    // Clicking button on old message (messageId 1234) should be rejected
    await expect(
      occurrenceService.handleUserAction(occ.id, "done", fatherId, new Date(), 1234),
    ).rejects.toThrow(ConflictError);

    // Clicking button on current message (messageId 5678) should succeed
    const res = await occurrenceService.handleUserAction(
      occ.id,
      "done",
      fatherId,
      new Date(),
      5678,
    );
    expect(res.success).toBe(true);
  });

  it("delivers occurrences independently to each recipient's private DM chat ID", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Multi-Recipient DM Test",
        targetUserIds: [fatherId, adminId],
        destinationChatId: 0,
        destinationType: "dm",
        scheduleType: "once",
        timesOfDay: ["10:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occs = await occRepo.find({ where: { reminderDefinitionId: def.id } });
    expect(occs).toHaveLength(2);

    const fatherOcc = occs.find((o) => o.targetUserId === fatherId)!;
    const adminOcc = occs.find((o) => o.targetUserId === adminId)!;

    mockApi.sentMessages = [];
    await occurrenceService.processDueOccurrence(fatherOcc.id);
    expect(mockApi.sentMessages).toHaveLength(1);
    expect(mockApi.sentMessages[0]?.chatId).toBe(fatherId);

    await occurrenceService.processDueOccurrence(adminOcc.id);
    expect(mockApi.sentMessages).toHaveLength(2);
    expect(mockApi.sentMessages[1]?.chatId).toBe(adminId);
  });

  it("rejects actions clicked from outdated/wrong chat ID", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Chat Freshness Test",
        targetUserIds: [fatherId],
        destinationChatId: -100111222,
        destinationType: "group",
        scheduleType: "once",
        timesOfDay: ["12:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;
    await occurrenceService.processDueOccurrence(occ.id);

    // Clicking from wrong chat should be rejected
    await expect(
      occurrenceService.handleUserAction(occ.id, "done", fatherId, new Date(), 1234, -999999),
    ).rejects.toThrow(ConflictError);

    // Clicking from correct chat and message succeeds
    const res = await occurrenceService.handleUserAction(
      occ.id,
      "done",
      fatherId,
      new Date(),
      1234,
      -100111222,
    );
    expect(res.success).toBe(true);
  });

  it("ensures atomic rollback of occurrence status and history events on transaction failure", async () => {
    const def = await reminderService.createReminder(
      {
        title: "Atomicity Test",
        targetUserIds: [fatherId],
        destinationChatId: fatherId,
        scheduleType: "once",
        timesOfDay: ["12:00"],
        startDate: "2026-10-19",
      },
      adminId,
    );

    const occRepo = dataSource.getRepository(ReminderOccurrence);
    const occ = (await occRepo.findOneBy({ reminderDefinitionId: def.id }))!;
    await occurrenceService.processDueOccurrence(occ.id);

    const initialOcc = (await occRepo.findOneBy({ id: occ.id }))!;
    expect(initialOcc.status).toBe("PENDING");

    const eventRepo = dataSource.getRepository(ReminderEvent);
    const initialEventsCount = await eventRepo.count({ where: { occurrenceId: occ.id } });

    // Force error inside transaction
    const originalLogEvent = historyService.logEvent.bind(historyService);
    historyService.logEvent = async (...args) => {
      if (args[4] === "completed") {
        throw new Error("Simulated database constraint failure during event log");
      }
      return originalLogEvent(...args);
    };

    try {
      await expect(
        occurrenceService.handleUserAction(occ.id, "done", fatherId, new Date(), 1234),
      ).rejects.toThrow("Simulated database constraint failure");

      // Verify that occurrence status was rolled back and is still PENDING
      const rolledBackOcc = (await occRepo.findOneBy({ id: occ.id }))!;
      expect(rolledBackOcc.status).toBe("PENDING");

      // Verify that no new event was persisted for this occurrence
      const finalEventsCount = await eventRepo.count({ where: { occurrenceId: occ.id } });
      expect(finalEventsCount).toBe(initialEventsCount);
    } finally {
      historyService.logEvent = originalLogEvent;
    }
  });
});
