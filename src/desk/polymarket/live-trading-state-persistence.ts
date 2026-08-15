/**
 * Live Trading Orchestrator — State Persistence Helpers
 *
 * Orchestrator-level state persistence: daily P&L, position snapshots,
 * day rollover. Works in concert with LiveTradingJournal (lower-level I/O).
 */

import type { LiveTradingJournal, DailyPnlState } from '../execution/live-trading-journal';
import type { LiveExecutionGuard, GuardStatus } from '../execution/live-execution-guard';
import type { LivePositionTracker } from '../execution/live-position-tracker';
import { logger } from '../../shared/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateContext {
  journal: LiveTradingJournal;
  guard: LiveExecutionGuard;
  positionTracker: LivePositionTracker;
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
      realizedPnl: summary.totalRealizedPnl,
      tradeCount: guardStatus.totalWins + guardStatus.totalLosses,
      winCount: guardStatus.totalWins,
      lossCount: guardStatus.totalLosses,
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
 * Restore state from journal on startup: day rollover, daily P&L, log.
 * Returns void — logs warnings but never throws (startup must not fail on stale state).
 */
export async function restoreOrchestratorState(ctx: StateContext): Promise<void> {
  const { journal, guard } = ctx;
  try {
    const rolled = journal.checkDayRollover();
    if (rolled) {
      logger.info('New trading day -- resetting daily P&L', 'Orchestrator', { prevDay: rolled });
      guard.resetDaily();
      journal.recordEvent('daily_reset', { prevDay: rolled });
    }

    const savedPnl = await journal.loadDailyPnl();
    if (savedPnl) {
      logger.info('Restored daily P&L', 'Orchestrator', savedPnl);
    }

    logger.info('State restored', 'Orchestrator', {
      positionsLoaded: (await journal.loadPositions()).length,
      fillCount: (await journal.getLifetimeStats()).totalFills,
      today: await journal.getToday(),
    });
  } catch (err) {
    logger.warn('Failed to restore state -- starting fresh', 'Orchestrator', { err: String(err) });
  }
}
