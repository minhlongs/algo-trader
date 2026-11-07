/**
 * Live Trading Orchestrator — State Persistence Helpers
 *
 * Orchestrator-level state persistence: daily P&L, position snapshots,
 * day rollover, and PolymarketOrderReconciler / T0_G2 state.
 */

import type { LiveTradingJournal, DailyPnlState } from '../execution/live-trading-journal';
import type { LiveExecutionGuard } from '../execution/live-execution-guard';
import type { LivePositionTracker, LivePosition } from '../execution/live-position-tracker';
import type { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import type { Leg2DecayStats } from './paper-orderbook-simulator';
import {
  saveReconcilerState,
  restoreReconcilerState,
  appendG2ShadowTelemetry,
  resolveGitTelemetryIdentity,
} from './g2-shadow-telemetry';
import { logger } from '../../shared/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateContext {
  journal: LiveTradingJournal;
  guard: LiveExecutionGuard;
  positionTracker: LivePositionTracker;
  reconciler?: PolymarketOrderReconciler;
  startedAtMs?: number;
  mode?: 'PAPER' | 'LIVE';
  leg2DecayStats?: Leg2DecayStats;
  onStartedAtMs?: (startedAtMs: number) => void;
}

export interface RestoreStateOptions {
  /** When true (e.g. LIVE mode), rethrows restoration failures so startup fails closed. */
  failClosed?: boolean;
  /** Allow PAPER cohort continuation across >15m probe gaps when drift === 0. */
  allowCohortContinuation?: boolean;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Persist orchestrator state to journal (positions, daily P&L, circuit trip, reconciler).
 * Safe to call from stop() — catches internally so it never blocks shutdown.
 */
export async function persistOrchestratorState(ctx: StateContext): Promise<void> {
  const { journal, guard, positionTracker, reconciler, startedAtMs, mode, leg2DecayStats } = ctx;
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

    if (reconciler) {
      const loopStartedAt = startedAtMs && startedAtMs > 0 ? startedAtMs : Date.now();
      saveReconcilerState(reconciler, loopStartedAt, leg2DecayStats);
      appendG2ShadowTelemetry({
        loopStartedAtMs: loopStartedAt,
        mode: mode ?? 'PAPER',
        event: 'stop',
        positionSummary: summary,
        reconciliationSummary: reconciler.reconcile(),
        leg2DecayStats,
      });
    }

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
 * Restore state from journal on startup: day rollover, daily P&L, open positions, reconciler, and circuit breaker.
 * When `options.failClosed` is true (LIVE mode), rethrows errors so trading cannot start with blank risk limits.
 */
export async function restoreOrchestratorState(
  ctx: StateContext,
  options: RestoreStateOptions = {},
): Promise<void> {
  const { journal, guard, positionTracker, reconciler, mode, leg2DecayStats, onStartedAtMs } = ctx;
  let startedAtMs = ctx.startedAtMs && ctx.startedAtMs > 0 ? ctx.startedAtMs : Date.now();
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

    if (reconciler) {
      const restoredRec = restoreReconcilerState(reconciler, {
        allowCohortContinuation: Boolean(options.allowCohortContinuation && (mode ?? 'PAPER') === 'PAPER'),
      });
      startedAtMs = restoredRec.startedAtMs;
      onStartedAtMs?.(startedAtMs);
      const posSummary = positionTracker.getSummary();
      const recSummary = reconciler.reconcile();
      const effectiveDecay = restoredRec.leg2DecayStats ?? leg2DecayStats;
      const currentIdentity = resolveGitTelemetryIdentity();
      const prevSha = restoredRec.previousCommitSha;
      const prevTree = restoredRec.previousSrcTreeHash;
      const versionChanged =
        restoredRec.restored &&
        Boolean(prevSha && prevSha !== 'unknown') &&
        (prevSha !== currentIdentity.sourceCommitSha ||
          (Boolean(prevTree) && prevTree !== currentIdentity.srcTreeHash));
      if (
        versionChanged &&
        Math.abs(recSummary.unexplainedDriftUsdc) <= 1e-6 &&
        recSummary.unknownOrderCount === 0
      ) {
        appendG2ShadowTelemetry({
          loopStartedAtMs: startedAtMs,
          mode: mode ?? 'PAPER',
          event: 'version_transition',
          positionSummary: posSummary,
          reconciliationSummary: recSummary,
          leg2DecayStats: effectiveDecay,
          versionTransition: {
            previousCommitSha: prevSha ?? 'unknown',
            currentCommitSha: currentIdentity.sourceCommitSha,
            previousSrcTreeHash: prevTree ?? 'unknown',
            currentSrcTreeHash: currentIdentity.srcTreeHash,
            reason: 'cohort_continuation_zero_drift',
          },
        });
      }
      appendG2ShadowTelemetry({
        loopStartedAtMs: startedAtMs,
        mode: mode ?? 'PAPER',
        event: 'start',
        positionSummary: posSummary,
        reconciliationSummary: recSummary,
        leg2DecayStats: effectiveDecay,
      });
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
