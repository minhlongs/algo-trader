/**
 * Live Trading Paper-to-Live Gating Types
 *
 * Types for the 10-gate criteria promoting strategies from paper trading to live capital.
 * Reference: docs/transition-criteria.md
 */

export type StrategyTradingTier = 'TIER_1_PAPER' | 'TIER_2_SHADOW' | 'TIER_3_MICRO_LIVE' | 'TIER_4_FULL_ALLOCATION';

export interface StrategyPaperProfile {
  strategyKey: string;
  paperStartDate: number;
  totalPaperTrades: number;
  winningTrades: number;
  losingTrades: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  maxDrawdown: number;
  sharpeRatio: number;
  valWinRate?: number;
  testWinRate?: number;
  regimeKellyWired?: boolean;
  circuitBreakerTested?: boolean;
  exchangeConnected?: boolean;
  currentTier?: StrategyTradingTier;
  promotedAt?: number;
}

export interface PaperToLiveGateCheck {
  gate: string;
  threshold: string;
  actual: string | number | boolean;
  passed: boolean;
  reason?: string;
}

export interface PaperToLiveEvaluationResult {
  eligible: boolean;
  strategyKey: string;
  daysActive: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  checks: PaperToLiveGateCheck[];
  rejectionReasons: string[];
  recommendedTier: StrategyTradingTier;
}

export interface GatingCriteriaConfig {
  minDurationDays: number;     // default: 30
  minPaperTrades: number;     // default: 50
  minWinRate: number;         // default: 0.55 (55%)
  minProfitFactor: number;    // default: 1.3
  maxDrawdown: number;        // default: 0.15 (15%)
  minSharpeRatio: number;     // default: 1.0
  maxOosDegradation: number;  // default: 0.05
}

export const DEFAULT_GATING_CONFIG: GatingCriteriaConfig = {
  minDurationDays: 30,
  minPaperTrades: 50,
  minWinRate: 0.55,
  minProfitFactor: 1.3,
  maxDrawdown: 0.15,
  minSharpeRatio: 1.0,
  maxOosDegradation: 0.05,
};
