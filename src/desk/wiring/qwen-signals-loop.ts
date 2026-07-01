/**
 * Qwen Signals Loop — upstream quality drift detector.
 * Runs every 6h, evaluates 7-day rolling win rate + Sharpe for Qwen paper trades.
 * When thresholds are breached, inserts a strategy_review_tasks row for human review.
 * Purely observational — no auto-disable, no kill paths.
 *
 * Singleton: startSignalsLoop() / stopSignalsLoop() / resetSignalsLoop() for test isolation.
 */

import { query } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';
import {
  qwenStrategyReviewsQueuedTotal,
  qwenSignalsLoopRunsTotal,
  qwenSignalsLoopLastRunTs,
  qwenSignalsLoopJournalWriteErrorsTotal,
  qwenStrategyReviewBacklogSize,
  qwenStrategyReviewOldestPendingAgeSec,
} from '../../platform/middleware/prometheus-metrics';
import { getTracer } from '../../shared/utils/tracing';

const DEFAULT_INTERVAL_MS = 6 * 3600 * 1000;
const DEFAULT_REVIEW_WINDOW_MS = 7 * 24 * 3600 * 1000;

let _timer: ReturnType<typeof setInterval> | null = null;

function getReviewWindowMs(): number {
  const raw = process.env.QWEN_REVIEW_WINDOW_MS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_REVIEW_WINDOW_MS;
  return isNaN(parsed) ? DEFAULT_REVIEW_WINDOW_MS : parsed;
}

function getIntervalMs(): number {
  const raw = process.env.QWEN_SIGNALS_LOOP_INTERVAL_MS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_INTERVAL_MS;
  return isNaN(parsed) ? DEFAULT_INTERVAL_MS : parsed;
}

function getWinRateMin(): number {
  const raw = process.env.QWEN_REVIEW_WIN_RATE_MIN;
  const parsed = raw ? parseFloat(raw) : 0.4;
  return isNaN(parsed) ? 0.4 : parsed;
}

function getSharpeMin(): number {
  const raw = process.env.QWEN_REVIEW_SHARPE_MIN;
  const parsed = raw ? parseFloat(raw) : 0.5;
  return isNaN(parsed) ? 0.5 : parsed;
}

function getMinSignals(): number {
  const raw = process.env.QWEN_REVIEW_MIN_SIGNALS;
  const parsed = raw ? parseInt(raw, 10) : 20;
  return isNaN(parsed) ? 20 : parsed;
}

function getMinTradesForSharpe(): number {
  const raw = process.env.QWEN_REVIEW_MIN_TRADES_FOR_SHARPE;
  const parsed = raw ? parseInt(raw, 10) : 30;
  return isNaN(parsed) ? 30 : parsed;
}

export interface QualityMetrics {
  winRate: number | null;
  sharpe: number | null;
  signalCount: number;
  closedTradeCount: number;
  windowStartMs: number;
  windowEndMs: number;
}

/**
 * Compute 7-day rolling quality metrics for a given source from paper_trades_v3.
 * win_rate = closed trades with pnl > 0 / total closed trades
 * sharpe   = mean(daily pnl_pct) / stddev(daily pnl_pct) * sqrt(365)  (annualised)
 */
export async function computeQualityMetrics(
  source: string,
  windowMs = getReviewWindowMs()
): Promise<QualityMetrics> {
  const windowEnd = Date.now();
  const windowStart = windowEnd - windowMs;

  const base: QualityMetrics = {
    winRate: null,
    sharpe: null,
    signalCount: 0,
    closedTradeCount: 0,
    windowStartMs: windowStart,
    windowEndMs: windowEnd,
  };

  try {
    // Signal count (all statuses)
    const signalRes = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM paper_trades_v3
       WHERE source = $1 AND created_at >= $2`,
      [source, windowStart]
    );
    base.signalCount = parseInt(signalRes.rows[0]?.cnt ?? '0', 10);

    // Win rate — closed trades
    const tradeRes = await query<{ total: string; wins: string }>(
      `SELECT
         COUNT(*)                                   AS total,
         COUNT(*) FILTER (WHERE pnl > 0)            AS wins
       FROM paper_trades_v3
       WHERE source = $1 AND status = 'closed' AND closed_at >= $2`,
      [source, windowStart]
    );
    const total = parseInt(tradeRes.rows[0]?.total ?? '0', 10);
    const wins = parseInt(tradeRes.rows[0]?.wins ?? '0', 10);
    base.closedTradeCount = total;

    if (total > 0) {
      base.winRate = wins / total;
    }

    // Sharpe — daily P&L pct aggregates (size_usd as denominator proxy)
    const sharpeRes = await query<{ avg_pct: string | null; stddev_pct: string | null; day_count: string }>(
      `SELECT
         AVG(daily_pnl_pct)    AS avg_pct,
         STDDEV(daily_pnl_pct) AS stddev_pct,
         COUNT(*)              AS day_count
       FROM (
         SELECT
           date_trunc('day', to_timestamp(closed_at / 1000)) AS day,
           SUM(pnl) / NULLIF(SUM(size_usd), 0)              AS daily_pnl_pct
         FROM paper_trades_v3
         WHERE source = $1 AND status = 'closed' AND closed_at >= $2
         GROUP BY day
       ) daily`,
      [source, windowStart]
    );

    const avgPct = parseFloat(sharpeRes.rows[0]?.avg_pct ?? '');
    const stddevPct = parseFloat(sharpeRes.rows[0]?.stddev_pct ?? '');

    if (!isNaN(avgPct) && !isNaN(stddevPct) && stddevPct > 0) {
      base.sharpe = (avgPct / stddevPct) * Math.sqrt(365);
    }

    return base;
  } catch (err) {
    logger.error('[QwenSignalsLoop] computeQualityMetrics DB error', { err });
    return base;
  }
}

/**
 * Persist one journal row for each evaluation run.
 * Called on ALL code paths: skipped, ok, queued, error.
 */
export async function persistRunJournal(
  source: string,
  metrics: QualityMetrics,
  decision: 'skipped_insufficient_data' | 'ok' | 'queued_review' | 'error',
  triggerReasons: string[],
  errorMessage?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO qwen_signals_loop_runs
         (source, metrics, decision, trigger_reasons, error_message)
       VALUES ($1, $2, $3, $4, $5)`,
      [source, JSON.stringify(metrics), decision, triggerReasons, errorMessage ?? null]
    );
    qwenSignalsLoopRunsTotal.inc({ decision });
    qwenSignalsLoopLastRunTs.set(Math.floor(Date.now() / 1000));
  } catch (err) {
    // Journal failure must never crash the main evaluation flow.
    // Emit counter so operators can distinguish "DB-write failing" from
    // "timer dead" when QwenSignalsLoopStale fires. See PR #120 runbook.
    qwenSignalsLoopJournalWriteErrorsTotal.inc();
    logger.error('[QwenSignalsLoop] persistRunJournal failed', { err });
  }
}

async function insertReviewTask(
  source: string,
  triggerReason: string,
  metrics: QualityMetrics
): Promise<void> {
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

/**
 * Snapshot pending backlog of strategy_review_tasks and emit gauges.
 * Single query returns count + oldest created_at (epoch seconds). Safe to call
 * after any mutation of the table. Failures are logged + swallowed — backlog
 * observability must not crash the main eval flow.
 */
export async function emitReviewBacklogGauges(): Promise<void> {
  try {
    const res = await query<{ backlog: string; oldest_epoch: string | null }>(
      `SELECT COUNT(*)::text AS backlog,
              EXTRACT(EPOCH FROM MIN(created_at))::text AS oldest_epoch
         FROM strategy_review_tasks
        WHERE status = 'pending'`
    );
    const row = res.rows[0];
    const backlog = parseInt(row?.backlog ?? '0', 10);
    qwenStrategyReviewBacklogSize.set(isNaN(backlog) ? 0 : backlog);

    const oldestEpoch = row?.oldest_epoch ? parseFloat(row.oldest_epoch) : null;
    if (oldestEpoch && !isNaN(oldestEpoch)) {
      qwenStrategyReviewOldestPendingAgeSec.set(Math.floor(Date.now() / 1000) - oldestEpoch);
    } else {
      qwenStrategyReviewOldestPendingAgeSec.set(0);
    }
  } catch (err) {
    logger.error('[QwenSignalsLoop] emitReviewBacklogGauges failed', { err });
  }
}

/**
 * Evaluate quality metrics and queue review tasks when thresholds are breached.
 * Journals EVERY run (skipped / ok / queued_review / error) for audit trail.
 * Exported for direct test access.
 */
export async function evaluateAndQueue(source: string): Promise<void> {
  return getTracer().startActiveSpan('qwen.signals_loop.evaluate', async (span) => {
    span.setAttribute('qwen.source', source);

    let metrics: QualityMetrics = {
      winRate: null,
      sharpe: null,
      signalCount: 0,
      closedTradeCount: 0,
      windowStartMs: 0,
      windowEndMs: 0,
    };

    try {
      metrics = await computeQualityMetrics(source);
    } catch (err) {
      logger.error('[QwenSignalsLoop] computeQualityMetrics threw unexpectedly', { err });
      span.recordException(err);
      await persistRunJournal(source, metrics, 'error', [], String(err));
      return;
    }

    const minSignals = getMinSignals();
    const minTrades = getMinTradesForSharpe();

    logger.info('[QwenSignalsLoop] Quality check', {
      source,
      signalCount: metrics.signalCount,
      closedTradeCount: metrics.closedTradeCount,
      winRate: metrics.winRate,
      sharpe: metrics.sharpe,
    });

    // Insufficient data — skip threshold checks
    if (metrics.signalCount < minSignals) {
      span.setAttribute('qwen.decision', 'skipped_insufficient_data');
      await persistRunJournal(source, metrics, 'skipped_insufficient_data', []);
      return;
    }

    const triggerReasons: string[] = [];

    if (metrics.winRate !== null && metrics.winRate < getWinRateMin()) {
      await insertReviewTask(source, 'win_rate_below_threshold', metrics);
      triggerReasons.push('win_rate_below_threshold');
    }

    if (metrics.closedTradeCount >= minTrades && metrics.sharpe !== null && metrics.sharpe < getSharpeMin()) {
      await insertReviewTask(source, 'sharpe_below_threshold', metrics);
      triggerReasons.push('sharpe_below_threshold');
    }

    const decision = triggerReasons.length > 0 ? 'queued_review' : 'ok';
    span.setAttribute('qwen.decision', decision);
    await persistRunJournal(source, metrics, decision, triggerReasons);

    // Snapshot backlog after journal write — reflects any new rows inserted
    // this cycle. Failure is swallowed, not fatal.
    await emitReviewBacklogGauges();
  });
}

export function startSignalsLoop(intervalMs = getIntervalMs()): void {
  if (_timer) return;

  // Pre-arm the freshness gauge at startup so QwenSignalsLoopStale does not
  // page for the full 6h cron interval after every deploy. The gauge will
  // be refreshed on the first real run; deadman-switch already covers the
  // pre-init process-death case, so no liveness coverage is lost.
  qwenSignalsLoopLastRunTs.set(Math.floor(Date.now() / 1000));
  // Pre-arm backlog gauges so QwenStrategyReviewBacklog does not false-fire
  // under noDataState=Alerting before the first eval cycle populates them.
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
