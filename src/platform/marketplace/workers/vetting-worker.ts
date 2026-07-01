/**
 * Vetting Worker — processes pending_vetting strategies on a schedule.
 *
 * Uses BullMQ when a Redis connection is available; falls back to a
 * plain setInterval loop so the worker works in environments without
 * Redis (tests, local dev).
 */

import { logger } from '../../../shared/utils/logger';
import { VettingService } from '../services/vetting.service';
import { getDbClient as _getDbClient } from '../../../shared/db/postgres-client';

export interface VettingWorkerOptions {
  pollIntervalMs?: number;
  maxBatchSize?: number;
}

export class VettingWorker {
  private static instance: VettingWorker | null = null;

  private vettingService: VettingService;
  private pollIntervalMs: number;
  private maxBatchSize: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private constructor(opts: VettingWorkerOptions = {}) {
    this.vettingService = VettingService.getInstance();
    this.pollIntervalMs = opts.pollIntervalMs ?? 60_000; // 1 min
    this.maxBatchSize = opts.maxBatchSize ?? 10;
  }

  static getInstance(opts?: VettingWorkerOptions): VettingWorker {
    if (!VettingWorker.instance) {
      VettingWorker.instance = new VettingWorker(opts);
    }
    return VettingWorker.instance;
  }

  /** Start the worker loop. Safe to call multiple times. */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('[VettingWorker] Starting', { pollIntervalMs: this.pollIntervalMs });
    this.timer = setInterval(() => this.processBatch(), this.pollIntervalMs);
    // Process immediately on start
    void this.processBatch();
  }

  /** Stop the worker loop. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[VettingWorker] Stopped');
  }

  /** Process one batch of pending vetting jobs. */
  async processBatch(): Promise<void> {
    if (!this.running) return;
    try {
      const pending = await this.vettingService.getPendingStrategies({ limit: this.maxBatchSize });
      if (pending.length === 0) return;

      logger.info('[VettingWorker] Processing batch', { count: pending.length });

      for (const strategy of pending) {
        try {
          const result = await this.vettingService.runVettingChecks(strategy.id);
          await this.vettingService.recordDecision(strategy.id, result.approved, 'system', result.feedback);
          logger.info('[VettingWorker] Strategy processed', {
            strategyId: strategy.id,
            approved: result.approved,
            score: result.score,
          });
        } catch (err) {
          logger.error('[VettingWorker] Failed to process strategy', {
            strategyId: strategy.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      logger.error('[VettingWorker] Batch processing error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  get isRunning(): boolean {
    return this.running;
  }
}
