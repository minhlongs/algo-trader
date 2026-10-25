/**
 * Live Trading Orchestrator — State Persistence Helpers
 *
 * Orchestrator-level state persistence: daily P&L, position snapshots,
 * day rollover. Works in concert with LiveTradingJournal (lower-level I/O).
 */

import type { LiveTradingJournal, DailyPnlState } from '../execution/live-trading-journal';
import type { LiveExecutionGuard } from '../execution/live-execution-guard';
import type { LivePositionTracker, LivePosition } from '../execution/live-position-tracker';
import { logger } from '../../shared/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateContext {
  journal: LiveTradingJournal;
  guard: LiveExecutionGuard;
  positionTracker: LivePositionTracker;
}

export interface RestoreStateOptions {
  /** When true (e.g. LIVE mode), rethrows restoration failures so startup fails closed. */
  failClosed?: boolean;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Persist orchestrator state to journal (positions, daily P&L, circuit trip).
 * Safe to call from stop() — catches internally so it never blocks shutdown.
 */
export async function persistOrchestratorState(ctx: StateContext): Promise<void> {
  const { journal, guard, positionTracker } = ctx;
  try {
    const positions = positionTracker.getPositions();
    journal.savePositions(positions);

    const summary = positionTracker.getSummary();
    const guardStatus = guard.getStatus();
    const today = journal.getToday();
    const pnlState: DailyPnlState = {
      date: today,
      realizedPnl: guardStatus.dailyPnl !== 0 ? guardStatus.dailyPnl : summary.totalRealizedPnl,
      tradeCount: guardStatus.totalWins + guardStatus.totalLosses,
      winCount: guardStatus.totalWins,
      lossCount: guardStatus.totalLosses,
      consecutiveLosses: guardStatus.consecutiveLosses,
      circuitTripped: guardStatus.circuitTripped,
    };
    journal.saveDailyPnl(pnlState);

    if (guardStatus.circuitTripped) {
      journal.recordEvent('circuit_trip', {
        consecutiveLosses: guardStatus.consecutiveLosses,
        dailyPnl: guardStatus.dailyPnl,
      });
    }
  } catch (err) {
    logger.error('Failed to persist state', 'Orchestrator', { err: String(err) });
  }
}

/**
 * Restore state from journal on startup: day rollover, daily P&L, open positions, and circuit breaker.
 * When `options.failClosed` is true (LIVE mode), rethrows errors so trading cannot start with blank risk limits.
 */
export async function restoreOrchestratorState(
  ctx: StateContext,
  options: RestoreStateOptions = {},
): Promise<void> {
  const { journal, guard, positionTracker } = ctx;
  try {
    const rolled = journal.checkDayRollover();
    if (rolled) {
      logger.info('New trading day -- resetting daily P&L', 'Orchestrator', { prevDay: rolled });
      guard.resetDaily();
      journal.recordEvent('daily_reset', { prevDay: rolled });
    }

    const savedPnl = await journal.loadDailyPnl();
    if (savedPnl) {
      if (typeof guard.hydrateState === 'function') {
        guard.hydrateState({
          dailyPnl: savedPnl.realizedPnl,
          totalWins: savedPnl.winCount,
          totalLosses: savedPnl.lossCount,
          consecutiveLosses: savedPnl.consecutiveLosses,
          circuitTripped: savedPnl.circuitTripped,
        });
      }
      logger.info('Restored daily P&L', 'Orchestrator', savedPnl);
    }

    const savedPositions = await journal.loadPositions<LivePosition>();
    if (Array.isArray(savedPositions) && typeof positionTracker.restorePositions === 'function') {
      positionTracker.restorePositions(savedPositions, savedPnl?.realizedPnl);
    }

    logger.info('State restored', 'Orchestrator', {
      positionsLoaded: Array.isArray(savedPositions) ? savedPositions.length : 0,
      fillCount: (await journal.getLifetimeStats()).totalFills,
      today: await journal.getToday(),
    });
  } catch (err) {
    if (options.failClosed) {
      logger.error('Failed to restore state in LIVE mode -- failing closed', 'Orchestrator', { err: String(err) });
      throw err;
    }
    logger.warn('Failed to restore state -- starting fresh', 'Orchestrator', { err: String(err) });
  }
}
