import type { OccurrenceService } from "../services/occurrence.service.js";
import { logger } from "../shared/logger.js";
import type { SchedulerRecovery } from "./recovery.js";

export class SchedulerWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isRunning = false;

  constructor(
    private readonly occurrenceService: OccurrenceService,
    private readonly recovery: SchedulerRecovery,
    private readonly intervalSeconds = 10,
    private readonly catchUpWindowMinutes = 60,
  ) {}

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Starting SchedulerWorker (interval: ${this.intervalSeconds}s)...`);

    // Perform crash recovery on boot
    try {
      const stats = await this.recovery.reconcileOverdueOccurrences(this.catchUpWindowMinutes);
      logger.info(
        `Scheduler recovery complete: ${stats.recoveredCount} recovered, ${stats.expiredMissedCount} expired/missed`,
      );
    } catch (err) {
      logger.error("Error during initial scheduler crash recovery:", err);
    }

    // Schedule regular polling
    this.scheduleNextTick();
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info("SchedulerWorker stopped.");
  }

  public async tick(now: Date = new Date()): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;

    try {
      const dueOccs = await this.occurrenceService.findDueOccurrences(now);

      for (const occ of dueOccs) {
        try {
          await this.occurrenceService.processDueOccurrence(occ.id, now);
          processedCount++;
        } catch (err) {
          logger.error(`Error processing due occurrence ${occ.id}:`, err);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private scheduleNextTick(): void {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      try {
        await this.tick();
      } catch (err) {
        logger.error("Unhandled error during scheduler tick:", err);
      } finally {
        this.scheduleNextTick();
      }
    }, this.intervalSeconds * 1000);
  }
}
