/**
 * Prometheus Metric Definitions — Qwen Signal Pipeline + L-Tier Rollback Visibility
 *
 * Submodule extracted from prometheus-metrics-definitions.ts to keep files under 200 lines.
 * All metrics register against the shared registry from prometheus-registry.ts.
 */
import client from 'prom-client';
import { register } from './prometheus-registry';

// ═══════════════════════════════════════════════════════════════════════════════
// Qwen M1 Max Signal Pipeline Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/** Gauge: rolling 24h paper P&L percentage for Qwen signals (decimal, e.g. -0.06 = -6%) */
export const qwenPaperPnlPctDef = new client.Gauge({
  name: 'algo_trader_qwen_paper_pnl_pct_v2',
  help: 'Rolling 24h paper P&L percentage for Qwen M1 Max signals (decimal)',
  registers: [register],
});

/** Counter: Qwen signals processed by the ingest route */
export const qwenSignalsTotalDef = new client.Counter({
  name: 'algo_trader_qwen_signals_total_v2',
  help: 'Total Qwen signals ingested via /api/v1/signals/ingest',
  labelNames: ['result'] as const,
  registers: [register],
});

/** Counter: strategy review tasks queued by signals loop */
export const qwenStrategyReviewsQueuedTotalDef = new client.Counter({
  name: 'algo_trader_qwen_strategy_reviews_queued_total_v2',
  help: 'Total strategy review tasks queued by qwen-signals-loop',
  labelNames: ['reason'] as const,
  registers: [register],
});

/** Counter: strategy review tasks resolved via admin API */
export const qwenStrategyReviewsResolvedTotalDef = new client.Counter({
  name: 'algo_trader_qwen_strategy_reviews_resolved_total_v2',
  help: 'Total strategy review tasks resolved via POST /admin/qwen/strategy-reviews/:id/resolve',
  labelNames: ['reason'] as const,
  registers: [register],
});

/** Gauge: current count of pending strategy review tasks */
export const qwenStrategyReviewBacklogSizeDef = new client.Gauge({
  name: 'algo_trader_qwen_strategy_review_backlog_size_v2',
  help: 'Count of strategy_review_tasks rows WHERE status=pending. Updated each signals-loop cycle (~6h).',
  registers: [register],
});

/** Gauge: age in seconds of oldest pending strategy review */
export const qwenStrategyReviewOldestPendingAgeSecDef = new client.Gauge({
  name: 'algo_trader_qwen_strategy_review_oldest_pending_age_sec_v2',
  help: 'Age in seconds of the oldest pending strategy_review_tasks row. 0 when backlog empty.',
  registers: [register],
});

/** Counter: admin kill-switch actions (audit trail for solo operator) */
export const qwenAdminKillActionsTotalDef = new client.Counter({
  name: 'algo_trader_qwen_admin_kill_actions_total_v2',
  help: 'Total admin actions on Qwen kill switch via /api/v1/admin/qwen/kill|unkill.',
  labelNames: ['action'] as const,
  registers: [register],
});

/** Counter: drawdown-monitor DB-query failures */
export const qwenDrawdownPnlQueryErrorsTotalDef = new client.Counter({
  name: 'algo_trader_qwen_drawdown_monitor_pnl_query_errors_total_v2',
  help: 'Count of computeRollingPnl SELECT failures.',
  registers: [register],
});

/** Counter: signals loop evaluation runs by decision outcome */
export const qwenSignalsLoopRunsTotalDef = new client.Counter({
  name: 'algo_trader_qwen_signals_loop_runs_total_v2',
  help: 'Total qwen signals loop evaluation runs by decision',
  labelNames: ['decision'] as const,
  registers: [register],
});

/** Gauge: unix-seconds of last signals-loop journal write (liveness probe) */
export const qwenSignalsLoopLastRunTsDef = new client.Gauge({
  name: 'algo_trader_qwen_signals_loop_last_run_ts_v2',
  help: 'Unix-seconds timestamp of the most recent qwen-signals-loop journal write.',
  registers: [register],
});

/** Counter: signals-loop journal INSERT failures */
export const qwenSignalsLoopJournalWriteErrorsTotalDef = new client.Counter({
  name: 'algo_trader_qwen_signals_loop_journal_write_errors_total_v2',
  help: 'Count of persistRunJournal INSERT failures.',
  registers: [register],
});

/** Counter: DNA journal write failures classified by error type */
export const journalWriteErrorsTotalDef = new client.Counter({
  name: 'journal_write_errors_total_v2',
  help: 'Total DNA journal write failures. Label error_type=db_error|timeout|unknown.',
  labelNames: ['error_type'] as const,
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════════
// L-Tier Rollback Visibility (Pillar 2 observability)
// ═══════════════════════════════════════════════════════════════════════════════

/** Gauge: kill-switch active state (0=inactive, 1=active), labeled by source */
export const qwenKillSwitchActiveDef = new client.Gauge({
  name: 'algo_trader_qwen_kill_switch_active_v2',
  help: 'L1 kill-switch active state (0|1). Labels: source=env|kv',
  labelNames: ['source'] as const,
  registers: [register],
});

/** Gauge: days remaining in MIN_PAPER_DAYS=30 validation window (L4) */
export const qwenPaperGateDaysRemainingDef = new client.Gauge({
  name: 'algo_trader_qwen_paper_gate_days_remaining_v2',
  help: 'L4 paper gate: days remaining before Qwen can flip live (0-30, clamped)',
  registers: [register],
});

/** Gauge: L3 drawdown auto-disable state (0=enabled, 1=disabled by breach) */
export const qwenDrawdownAutoDisabledDef = new client.Gauge({
  name: 'algo_trader_qwen_drawdown_auto_disabled_v2',
  help: 'L3 drawdown auto-disable state (0|1). 1 = swarm disabled by -5%% breach',
  registers: [register],
});

/** Gauge: unix-seconds of last drawdown-monitor cycle invocation (liveness probe) */
export const qwenDrawdownMonitorLastRunTsDef = new client.Gauge({
  name: 'algo_trader_qwen_drawdown_monitor_last_run_ts_v2',
  help: 'Unix-seconds timestamp of the most recent qwen-drawdown-monitor cycle start.',
  registers: [register],
});
