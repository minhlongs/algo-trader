/**
 * Qwen Signals Loop — upstream quality drift detector.
 * Runs every 6h, evaluates 7-day rolling win rate + Sharpe for Qwen paper trades.
 * When thresholds are breached, inserts a strategy_review_tasks row for human review.
 * Purely observational — no auto-disable, no kill paths.
 */
import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import { getTracer } from '../../shared/utils/tracing';
import {
  qwenStrategyReviewsQueuedTotal,
  qwenSignalsLoopRunsTotal,
  qwenSignalsLoopLastRunTs,
  qwenSignalsLoopJournalWriteErrorsTotal,
  qwenStrategyReviewBacklogSize,
  qwenStrategyReviewOldestPendingAgeSec,
} from '../../platform/middleware/prometheus-metrics';
import { getReviewWindowMs, getMinSignals } from './qwen-signals-loop-config';
import {
  type QualityMetrics,
  createEmptyQualityMetrics,
  parseTradeWinStats,
  parseAnnualizedSharpe,
  evaluateQualityThresholds,
  parseBacklogGauges,
} from './qwen-signals-helpers';

export const DEFAULT_INTERVAL_MS = 6 * 3600 * 1000;
export * from './qwen-signals-loop-config';
export * from './qwen-signals-helpers';
export { startSignalsLoop, stopSignalsLoop, resetSignalsLoop } from './qwen-signals-loop-timer';

export async function computeQualityMetrics(source: string, windowMs = getReviewWindowMs()): Promise<QualityMetrics> {
  const windowEnd = Date.now();
  const windowStart = windowEnd - windowMs;
  const base = createEmptyQualityMetrics(windowStart, windowEnd);
  try {
    const signalRes = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM paper_trades_v3 WHERE source = $1 AND created_at >= $2`,
      [source, windowStart]
    );
    base.signalCount = parseInt(signalRes.rows[0]?.cnt ?? '0', 10);

    const tradeRes = await query<{ total: string; wins: string }>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE pnl > 0) AS wins
       FROM paper_trades_v3 WHERE source = $1 AND status = 'closed' AND closed_at >= $2`,
      [source, windowStart]
    );
    const { closedTradeCount, winRate } = parseTradeWinStats(tradeRes.rows[0]);
    base.closedTradeCount = closedTradeCount;
    base.winRate = winRate;

    const sharpeRes = await query<{ avg_pct: string | null; stddev_pct: string | null }>(
      `SELECT AVG(daily_pnl_pct) AS avg_pct, STDDEV(daily_pnl_pct) AS stddev_pct
       FROM (SELECT date_trunc('day', to_timestamp(closed_at / 1000)) AS day,
                    SUM(pnl) / NULLIF(SUM(size_usd), 0) AS daily_pnl_pct
             FROM paper_trades_v3 WHERE source = $1 AND status = 'closed' AND closed_at >= $2
             GROUP BY day) daily`,
      [source, windowStart]
    );
    base.sharpe = parseAnnualizedSharpe(sharpeRes.rows[0]);
    return base;
  } catch (err) {
    logger.error('[QwenSignalsLoop] computeQualityMetrics DB error', { err });
    return base;
  }
}

export async function persistRunJournal(
  source: string,
  metrics: QualityMetrics,
  decision: 'skipped_insufficient_data' | 'ok' | 'queued_review' | 'error',
  triggerReasons: string[],
  errorMessage?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO qwen_signals_loop_runs (source, metrics, decision, trigger_reasons, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [source, JSON.stringify(metrics), decision, triggerReasons, errorMessage ?? null]
    );
    qwenSignalsLoopRunsTotal.inc({ decision });
    qwenSignalsLoopLastRunTs.set(Math.floor(Date.now() / 1000));
  } catch (err) {
    qwenSignalsLoopJournalWriteErrorsTotal.inc();
    logger.error('[QwenSignalsLoop] persistRunJournal failed', { err });
  }
}

async function insertReviewTask(source: string, triggerReason: string, metrics: QualityMetrics): Promise<void> {
  const res = await query<{ id: string }>(
    `INSERT INTO strategy_review_tasks (source, trigger_reason, metrics)
     VALUES ($1, $2, $3)
     ON CONFLICT (source, trigger_reason, ((created_at AT TIME ZONE 'UTC')::date)) DO NOTHING
     RETURNING id`,
    [source, triggerReason, JSON.stringify(metrics)]
  );
  if (res.rows.length === 0) return;
  qwenStrategyReviewsQueuedTotal.inc({ reason: triggerReason });
  logger.warn('[QwenSignalsLoop] Review task queued', { source, triggerReason, metrics });
}

export async function emitReviewBacklogGauges(): Promise<void> {
  try {
    const res = await query<{ backlog: string; oldest_epoch: string | null }>(
      `SELECT COUNT(*)::text AS backlog, EXTRACT(EPOCH FROM MIN(created_at))::text AS oldest_epoch
       FROM strategy_review_tasks WHERE status = 'pending'`
    );
    const { backlog, oldestAgeSec } = parseBacklogGauges(res.rows[0]);
    qwenStrategyReviewBacklogSize.set(backlog);
    qwenStrategyReviewOldestPendingAgeSec.set(oldestAgeSec);
  } catch (err) {
    logger.error('[QwenSignalsLoop] emitReviewBacklogGauges failed', { err });
  }
}

export async function evaluateAndQueue(source: string): Promise<void> {
  return getTracer().startActiveSpan('qwen.signals_loop.evaluate', async (span) => {
    span.setAttribute('qwen.source', source);
    let metrics = createEmptyQualityMetrics();
    try {
      metrics = await computeQualityMetrics(source);
    } catch (err) {
      logger.error('[QwenSignalsLoop] computeQualityMetrics threw unexpectedly', { err });
      span.recordException(err as Error);
      await persistRunJournal(source, metrics, 'error', [], String(err));
      return;
    }
    logger.info('[QwenSignalsLoop] Quality check', { source, signalCount: metrics.signalCount, closedTradeCount: metrics.closedTradeCount, winRate: metrics.winRate, sharpe: metrics.sharpe });
    if (metrics.signalCount < getMinSignals()) {
      span.setAttribute('qwen.decision', 'skipped_insufficient_data');
      await persistRunJournal(source, metrics, 'skipped_insufficient_data', []);
      return;
    }
    const triggerReasons = evaluateQualityThresholds(metrics);
    for (const reason of triggerReasons) {
      await insertReviewTask(source, reason, metrics);
    }
    const decision = triggerReasons.length > 0 ? 'queued_review' : 'ok';
    span.setAttribute('qwen.decision', decision);
    await persistRunJournal(source, metrics, decision, triggerReasons);
    await emitReviewBacklogGauges();
  });
}
