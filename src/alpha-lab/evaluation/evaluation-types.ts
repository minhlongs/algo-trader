/**
 * Evaluation Types
 *
 * Per-regime, per-month, and per-volatility-bucket breakdown types.
 */

import type { MarketRegime } from '../regimes/regime-types';

// ── Bucket Breakdowns ────────────────────────────────────────────────────────

export interface RegimeBreakdown {
  regime: MarketRegime;
  numTrades: number;
  winRate: number;
  lossRate: number;
  meanLabel: number;
  netPnl: number;
}

export interface MonthBreakdown {
  month: string; // "YYYY-MM"
  numTrades: number;
  winRate: number;
  netPnl: number;
}

export interface VolatilityBucketBreakdown {
  bucket: 'low' | 'medium' | 'high';
  numTrades: number;
  winRate: number;
  netPnl: number;
}

// ── Evaluation Report ────────────────────────────────────────────────────────

export interface EvaluationReport {
  /** Overall metrics (same shape as MetricsReport from metrics-calculator). */
  overall: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    lossRate: number;
    profitFactor: number;
    avgPnlPerTrade: number;
    totalNetPnl: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
  /** Breakdown by market regime. */
  byRegime: RegimeBreakdown[];
  /** Breakdown by calendar month (YYYY-MM). */
  byMonth: MonthBreakdown[];
  /** Breakdown by realized volatility bucket. */
  byVolatilityBucket: VolatilityBucketBreakdown[];
}