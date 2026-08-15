/**
 * Strategy Runner Tick Timer
 *
 * Manages the polling timer that triggers strategy execution at regular intervals.
 * Used as a fallback when no price events are received.
 */

import { logger } from '@shared/utils/logger';

// ── Tick Timer Context ─────────────────────────────────────────────────────────

export interface TickTimerContext {
  status: string;
  strategyName: string;
  tickIntervalMs: number;
  execute: () => Promise<void>;
  trackedTokens: { size: number };
}

// ── Tick Timer ─────────────────────────────────────────────────────────────────

export function createTickTimer(ctx: TickTimerContext): { start: () => NodeJS.Timeout; stop: (timer: NodeJS.Timeout | null) => void } {
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (ctx.status !== 'running') return;

    logger.debug('Tick timer firing', 'StrategyRunner', {
      strategy: ctx.strategyName,
      trackedTokens: ctx.trackedTokens.size,
    });

    await ctx.execute();
  };

  return {
    start: () => {
      timer = setInterval(() => tick(), ctx.tickIntervalMs);
      timer.unref();
      return timer;
    },
    stop: (currentTimer: NodeJS.Timeout | null) => {
      if (currentTimer) {
        clearInterval(currentTimer);
      }
    },
  };
}
