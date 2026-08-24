/**
 * Experiment Types
 *
 * Configuration, result, and reproducibility types for the alpha-lab
 * experiment engine. Every experiment is a frozen snapshot: same config +
 * same data + same seed = identical results.
 */

import type { CandleLike } from '../regimes/regime-types';
import type { MarketRegime } from '../regimes/regime-types';

// ── Split Strategy ────────────────────────────────────────────────────────────

export type SplitMode = 'expanding' | 'rolling';

export interface SplitConfig {
  /** How to advance the train window over time. */
  mode: SplitMode;
  /** Fraction of total bars used for training (0–1). */
  trainRatio: number;
  /** Fraction of total bars used for validation (0–1). */
  valRatio: number;
  /** Fraction of total bars used for test (0–1). Must leave room for at least 1 walk-forward step. */
  testRatio: number;
  /** Only for rolling mode: number of bars in each train window. Ignored in expanding mode. */
  trainWindowSize?: number;
  /** Only for rolling mode: number of bars in each val window. Ignored in rolling mode. */
  valWindowSize?: number;
}

export interface DataSplit {
  /** Window label: "train" | "val" | "test". */
  kind: 'train' | 'val' | 'test';
  /** Walk-forward step index (0-based). */
  step: number;
  /** Start index (inclusive) into the candle array. */
  startIdx: number;
  /** End index (exclusive) into the candle array. */
  endIdx: number;
}

// ── Cost Model (stub for P8) ─────────────────────────────────────────────────

export type CostScenario = 'normal' | 'conservative' | 'adverse';

export interface CostConfig {
  /** Trading fee in basis points per side. */
  feeBps: number;
  /** Slippage in basis points per trade. */
  slippageBps: number;
  /** Scenario label for reporting. */
  scenario: CostScenario;
}

export const COST_PRESETS: Record<CostScenario, CostConfig> = {
  normal: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
  conservative: { feeBps: 10, slippageBps: 5, scenario: 'conservative' },
  adverse: { feeBps: 20, slippageBps: 10, scenario: 'adverse' },
};

// ── Experiment Configuration ──────────────────────────────────────────────────

export interface ExperimentConfig {
  /** Unique experiment identifier (caller-assigned). */
  experimentId: string;
  /** Human-readable hypothesis being tested. */
  hypothesis: string;
  /** Market identifier (e.g. "BTC/USD", "ETH/USD", "SOL/USD"). */
  symbol: string;
  /** Candle timeframe (e.g. "1h", "4h", "1d"). */
  timeframe: string;
  /** Feature names to compute (must exist in feature registry). */
  features: string[];
  /** Regime filter: 'all' or list of regime names to include. */
  regimes: 'all' | MarketRegime[];
  /** Take-profit threshold (e.g. 0.02 = +2%). */
  tp: number;
  /** Stop-loss threshold (e.g. 0.01 = -1%). */
  sl: number;
  /** Maximum holding period in bars. */
  maxHolding: number;
  /** Lookback window for regime/feature computation. */
  lookback: number;
  /** Walk-forward split configuration. */
  split: SplitConfig;
  /** Cost model for this experiment. */
  cost: CostConfig;
  /** Random seed for reproducibility (used where applicable). */
  seed: number;
  /** Git commit hash at experiment creation time. */
  gitCommit: string;
  /** ISO-8601 UTC timestamp of when the experiment was created. */
  createdAt: string;
}

// ── Experiment Results ────────────────────────────────────────────────────────

export interface SplitMetrics {
  /** Number of labeled entries in this split. */
  numTrades: number;
  /** Win rate: fraction of trades with label +1. */
  winRate: number;
  /** Fraction of labels that are 0 (timeout). */
  timeoutRate: number;
  /** Fraction of labels that are -1. */
  lossRate: number;
  /** Mean of all labels. */
  meanLabel: number;
  /** Number of distinct regimes present in this split. */
  regimesPresent: MarketRegime[];
  /** Net PnL after fees + slippage (gross PnL − round-trip cost). */
  totalPnl: number;
  /** Annualized Sharpe ratio from the strategy equity curve. */
  sharpeRatio: number;
  /** Profit factor (gross profit / gross loss). */
  profitFactor: number;
  /** Max drawdown (negative) from the strategy equity curve. */
  maxDrawdown: number;
}

export interface WalkForwardStep {
  /** Step index (0-based). */
  step: number;
  /** Train split data. */
  train: DataSplit;
  /** Validation split data. */
  val: DataSplit;
  /** Test split data. */
  test: DataSplit;
}

export interface ExperimentResult {
  /** Config snapshot frozen at experiment creation. */
  config: ExperimentConfig;
  /** Walk-forward steps generated for this experiment. */
  steps: WalkForwardStep[];
  /** Per-split metrics across all steps. */
  metrics: {
    train: SplitMetrics;
    val: SplitMetrics;
    test: SplitMetrics;
  };
  /** Total number of bars processed. */
  totalBars: number;
  /** Number of walk-forward steps. */
  numSteps: number;
}
