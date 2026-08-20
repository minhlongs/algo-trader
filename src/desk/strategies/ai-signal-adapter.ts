/**
 * AI/ML Signal Adapter
 *
 * Bridges alpha-lab ML model outputs into the live TradingPipeline.
 * Each incoming AISignal is gate-checked against configurable
 * confidence, expectancy, and regime filters before the pipeline
 * routes it to Kelly sizing and execution.
 *
 * Integration path:
 *   alpha-lab ML model → AISignal → AISignalAdapter → TradingPipeline
 */

import { computeMetrics } from '../backtesting/metrics-calculator';
import type { SplitMetrics } from '../../alpha-lab/experiments/experiment-types';
import type { MarketRegime } from '../../alpha-lab/regimes/regime-types';
import type { BacktestTrade, MetricsReport } from '../backtesting/types';

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Configuration for the AI signal adapter.
 */
export interface AISignalConfig {
  /** Minimum confidence a signal must have to pass (0–1). */
  confidenceThreshold: number;
  /** Minimum expectancy (meanLabel) required for a signal to be accepted. */
  minExpectancy: number;
  /**
   * If provided, only signals whose regime appears in this list are accepted.
   * Empty or undefined means no regime filtering.
   */
  regimeFilter?: MarketRegime[];
}

// ── Signal Type ────────────────────────────────────────────────────────────

/**
 * An ML-generated trading signal produced by an alpha-lab model.
 */
export interface AISignal {
  /** Strategy / model identifier that produced the signal. */
  strategyId: string;
  /** Trade direction. */
  direction: 'BUY' | 'SELL';
  /** Model confidence score (0–1). */
  confidence: number;
  /** Expected payoff per unit risked. */
  expectancy: number;
  /** Current market regime at signal time. */
  regime: MarketRegime;
  /** Unix timestamp (ms) when the signal was generated. */
  timestamp: number;
}

// ── Adapter ────────────────────────────────────────────────────────────────

/**
 * Filters and scores AI/ML signals before they enter the live
 * TradingPipeline. All checks are pure predicates — no I/O.
 */
export class AISignalAdapter {
  private readonly config: AISignalConfig;

  constructor(config: AISignalConfig) {
    this.config = config;
  }

  /**
   * Determine whether a signal passes the confidence and expectancy gates.
   *
   * @param signal - ML signal to evaluate
   * @returns true when both confidence ≥ threshold and expectancy ≥ minExpectancy
   */
  evaluateSignal(signal: AISignal): boolean {
    return (
      signal.confidence >= this.config.confidenceThreshold &&
      signal.expectancy >= this.config.minExpectancy
    );
  }

  /**
   * Check whether a signal's regime is permitted by the active filter.
   *
   * When `regimeFilter` is empty or absent all regimes are accepted.
   *
   * @param signal - ML signal whose regime is tested
   * @returns true if the regime is allowed
   */
  filterByRegime(signal: AISignal): boolean {
    const filter = this.config.regimeFilter;
    if (!filter || filter.length === 0) return true;
    return filter.includes(signal.regime);
  }

  /**
   * Compute a composite strategy score from backtesting metrics.
   *
   * The score is a weighted blend of three components:
   * - winRate          (weight 0.4) — consistency of profitable trades
   * - normalized PnL   (weight 0.3) — directional expectancy proxy
   * - profitFactor     (weight 0.3) — gross profit / gross loss ratio
   *
   * Clamped to [0, 1].
   *
   * @param metrics - Backtest MetricsReport for the strategy
   * @returns Composite score between 0 and 1
   */
  scoreStrategy(metrics: MetricsReport): number {
    const profitScore = metrics.profitFactor / (1 + metrics.profitFactor);
    // totalPnl is a return-on-capital fraction (e.g. 0.02 = +2% of entry
    // capital), so normalize by 0.05 (5% return = full score) rather than
    // dividing by 1000, which assumed nominal USD PnL and silently scored
    // every strategy ~0.
    const pnlScore = metrics.totalPnl > 0
      ? Math.min(Math.abs(metrics.totalPnl) / 0.05, 1)
      : 0;

    return Math.min(
      metrics.winRate * 0.4 +
        pnlScore * 0.3 +
        profitScore * 0.3,
      1,
    );
  }
}
