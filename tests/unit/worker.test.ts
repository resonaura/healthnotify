import { describe, expect, it, vi } from "vitest";
import { SchedulerWorker } from "../../src/scheduler/worker.js";
import type { OccurrenceService } from "../../src/services/occurrence.service.js";
import type { SchedulerRecovery } from "../../src/scheduler/recovery.js";
import type { ReminderOccurrence } from "../../src/persistence/entities/reminder-occurrence.entity.js";

describe("SchedulerWorker Unit", () => {
  it("starts, handles crash recovery, schedules timer ticks, and stops cleanly", async () => {
    vi.useFakeTimers();

    const mockOccurrenceService = {
      findDueOccurrences: vi.fn().mockResolvedValue([]),
      processDueOccurrence: vi.fn().mockResolvedValue(undefined),
    } as unknown as OccurrenceService;

    const mockRecovery = {
      reconcileOverdueOccurrences: vi
        .fn()
        .mockResolvedValue({ recoveredCount: 1, expiredMissedCount: 0 }),
    } as unknown as SchedulerRecovery;

    const worker = new SchedulerWorker(mockOccurrenceService, mockRecovery, 5, 30);

    // Double start should be a no-op
    await worker.start();
    await worker.start();

    expect(mockRecovery.reconcileOverdueOccurrences).toHaveBeenCalledTimes(1);

    // Advance timer by 5 seconds to trigger next tick
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockOccurrenceService.findDueOccurrences).toHaveBeenCalled();

    await worker.stop();
    // Subsequent timer advancement should not trigger tick
    vi.clearAllMocks();
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockOccurrenceService.findDueOccurrences).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("handles errors during recovery and during occurrence processing gracefully", async () => {
    const mockOccurrenceService = {
      findDueOccurrences: vi.fn().mockResolvedValue([{ id: "occ-fail" } as ReminderOccurrence]),
      processDueOccurrence: vi.fn().mockRejectedValue(new Error("Network glitch")),
    } as unknown as OccurrenceService;

    const mockRecovery = {
      reconcileOverdueOccurrences: vi.fn().mockRejectedValue(new Error("DB locked")),
    } as unknown as SchedulerRecovery;

    const worker = new SchedulerWorker(mockOccurrenceService, mockRecovery, 10, 60);

    // Boot should not throw even if recovery rejects
    await expect(worker.start()).resolves.toBeUndefined();

    // Tick should not throw even if occurrence processing throws
    const count = await worker.tick();
    expect(count).toBe(0);

    await worker.stop();
  });

  it("handles unhandled error inside scheduled timer tick", async () => {
    vi.useFakeTimers();

    const mockOccurrenceService = {
      findDueOccurrences: vi.fn().mockRejectedValue(new Error("Fatal DB crash")),
      processDueOccurrence: vi.fn(),
    } as unknown as OccurrenceService;

    const mockRecovery = {
      reconcileOverdueOccurrences: vi
        .fn()
        .mockResolvedValue({ recoveredCount: 0, expiredMissedCount: 0 }),
    } as unknown as SchedulerRecovery;

    const worker = new SchedulerWorker(mockOccurrenceService, mockRecovery, 2, 30);
    await worker.start();

    // Advance timer to trigger failing tick
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockOccurrenceService.findDueOccurrences).toHaveBeenCalled();

    await worker.stop();
    vi.useRealTimers();
  });

  it("prevents concurrent ticks when a tick is already in progress", async () => {
    let resolveSlowTick!: () => void;
    const slowPromise = new Promise<void>((resolve) => {
      resolveSlowTick = resolve;
    });

    const mockOccurrenceService = {
      findDueOccurrences: vi.fn().mockImplementation(async () => {
        await slowPromise;
        return [];
      }),
      processDueOccurrence: vi.fn(),
    } as unknown as OccurrenceService;

    const mockRecovery = {
      reconcileOverdueOccurrences: vi
        .fn()
        .mockResolvedValue({ recoveredCount: 0, expiredMissedCount: 0 }),
    } as unknown as SchedulerRecovery;

    const worker = new SchedulerWorker(mockOccurrenceService, mockRecovery, 10, 60);

    // Launch first tick (will pause on slowPromise)
    const tick1 = worker.tick();

    // Concurrent second tick should immediately return 0 without doing work
    const count2 = await worker.tick();
    expect(count2).toBe(0);

    // Resolve first tick
    resolveSlowTick();
    const count1 = await tick1;
    expect(count1).toBe(0);
  });
});
