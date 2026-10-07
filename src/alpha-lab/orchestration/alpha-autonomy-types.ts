/**
 * Alpha Lab Autonomy Types
 *
 * Defines contracts for scheduled autonomous strategy evaluation,
 * statistical promotion criteria, and bounded metrics reporting.
 */

import type { CandleLike } from '../regimes/regime-types';

export type PipelineJobStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export interface PromotionCriteria {
  minSharpe: number;
  minProfitFactor: number;
  maxDrawdownPct: number;
  minWinRate: number;
  minTradeCount: number;
}

export interface AutonomyMetrics {
  jobId: string;
  strategyId: string;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  winRate: number;
  tradeCount: number;
  labelsEvaluated: number;
  promoted: boolean;
  executedAt: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SchedulerConfig {
  intervalMs?: number;
  runOnStart?: boolean;
  maxConsecutiveFailures?: number;
}

export interface AutonomyEvaluationOptions {
  strategyId?: string;
  candles?: CandleLike[];
  tpPct?: number;
  slPct?: number;
  maxHoldingBars?: number;
  criteria?: Partial<PromotionCriteria>;
}

export interface AutonomyJobRecord {
  jobId: string;
  status: PipelineJobStatus;
  startTime: number;
  endTime?: number;
  metrics?: AutonomyMetrics;
  error?: string;
}
