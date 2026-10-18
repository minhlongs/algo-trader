/**
 * Qwen Signals Loop — pure quality metric computation, threshold evaluation, and gauge parsing helpers.
 */
import { getMinTradesForSharpe, getWinRateMin, getSharpeMin } from './qwen-signals-loop-config';

export interface QualityMetrics {
  winRate: number | null;
  sharpe: number | null;
  signalCount: number;
  closedTradeCount: number;
  windowStartMs: number;
  windowEndMs: number;
}

export function createEmptyQualityMetrics(windowStartMs = 0, windowEndMs = 0): QualityMetrics {
  return {
    winRate: null,
    sharpe: null,
    signalCount: 0,
    closedTradeCount: 0,
    windowStartMs,
    windowEndMs,
  };
}

export function parseTradeWinStats(row?: { total?: string; wins?: string }): {
  closedTradeCount: number;
  winRate: number | null;
} {
  const total = parseInt(row?.total ?? '0', 10);
  const wins = parseInt(row?.wins ?? '0', 10);
  return {
    closedTradeCount: total,
    winRate: total > 0 ? wins / total : null,
  };
}

export function parseAnnualizedSharpe(row?: {
  avg_pct?: string | null;
  stddev_pct?: string | null;
}): number | null {
  const avgPct = parseFloat(row?.avg_pct ?? '');
  const stddevPct = parseFloat(row?.stddev_pct ?? '');
  if (!isNaN(avgPct) && !isNaN(stddevPct) && stddevPct > 0) {
    return (avgPct / stddevPct) * Math.sqrt(365);
  }
  return null;
}

export function evaluateQualityThresholds(metrics: QualityMetrics): string[] {
  const reasons: string[] = [];
  if (metrics.winRate !== null && metrics.winRate < getWinRateMin()) {
    reasons.push('win_rate_below_threshold');
  }
  if (
    metrics.closedTradeCount >= getMinTradesForSharpe() &&
    metrics.sharpe !== null &&
    metrics.sharpe < getSharpeMin()
  ) {
    reasons.push('sharpe_below_threshold');
  }
  return reasons;
}

export function parseBacklogGauges(
  row?: { backlog?: string; oldest_epoch?: string | null },
  nowSec = Math.floor(Date.now() / 1000),
): { backlog: number; oldestAgeSec: number } {
  const backlogRaw = parseInt(row?.backlog ?? '0', 10);
  const backlog = isNaN(backlogRaw) ? 0 : backlogRaw;
  const oldestEpoch = row?.oldest_epoch ? parseFloat(row.oldest_epoch) : null;
  const oldestAgeSec =
    oldestEpoch && !isNaN(oldestEpoch) ? nowSec - oldestEpoch : 0;
  return { backlog, oldestAgeSec };
}
