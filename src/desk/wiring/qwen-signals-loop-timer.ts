/**
 * Qwen Signals Loop — Interval timer and lifecycle methods
 */
import { logger } from '../../shared/utils/logger';
import {
  qwenSignalsLoopLastRunTs,
  qwenStrategyReviewBacklogSize,
  qwenStrategyReviewOldestPendingAgeSec,
} from '../../platform/middleware/prometheus-metrics';
import { getIntervalMs } from './qwen-signals-loop-config';
import { evaluateAndQueue } from './qwen-signals-loop';

let _timer: ReturnType<typeof setInterval> | null = null;

export function startSignalsLoop(intervalMs = getIntervalMs()): void {
  if (_timer) return;

  qwenSignalsLoopLastRunTs.set(Math.floor(Date.now() / 1000));
  qwenStrategyReviewBacklogSize.set(0);
  qwenStrategyReviewOldestPendingAgeSec.set(0);

  logger.info('[QwenSignalsLoop] Started', { intervalMs });
  _timer = setInterval(() => {
    evaluateAndQueue('qwen-m1max').catch((err) =>
      logger.error('[QwenSignalsLoop] Unhandled error in check cycle', { err })
    );
  }, intervalMs);

  if (_timer.unref) _timer.unref();
}

export function stopSignalsLoop(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.debug('[QwenSignalsLoop] Stopped');
  }
}

export function resetSignalsLoop(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
