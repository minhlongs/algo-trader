/**
 * Backtesting Types
 *
 * Shared types for the backtesting engine, CLI output, and platform API.
 */

import type { StrategyName } from '../core/types';
import type { BaseStrategyConfig } from '../strategies/polymarket/base-polymarket-strategy';
import type { ResultClassName } from '../../alpha-lab/provenance/run-card';

// ── Configuration ──────────────────────────────────────────────────────────────

export interface BacktestConfig {
  /** Strategy name (kebab-case registry key) */
  strategy: string;
  /** Strategy-specific config overrides */
  strategyConfig?: Partial<BaseStrategyConfig>;
  /** Paper trading config for the orchestrator */
  paperTrading: true;
  /** Capital in USDC */
  capitalUsdc: number;
  /** Number of days of historical data to fetch */
  days: number;
  /** Tick interval between data points in ms (default: 1h = 3_600_000) */
  tickIntervalMs?: number;
}

/**
 * Data quality gate options for the OHLCV research path.
 * Additive — existing BacktestConfig callers are unaffected.
 */
export interface DataQualityGateConfig {
  /**
   * Fail fast when the quality gate reports violations.
   * Default true (research path must run on validated data);
   * set false for warn-only live-feed debugging.
   */
  strict?: boolean;
  /** Override expected candle interval (ms) for gap detection. */
  timeframeMs?: number;
  /** Price-jump threshold as a multiple of ATR (default 10). */
  priceJumpAtrMultiple?: number;
}

/** BacktestConfig plus additive runner options. */
export interface BacktestRunnerOptions extends BacktestConfig {
  /** Data quality gate settings (OHLCV path only). */
  dataQuality?: DataQualityGateConfig;
  /**
   * Directory to write a provenance run card into. When set, a run card is
   * written (fail-safe) recording this backtest's config hash, result class,
   * and metrics. Omit to skip provenance — useful for pure unit tests.
   */
  runCardDir?: string;
  /**
   * Result class for the run card. Defaults to 'PAPER' — callers running on
   * real (live) data must pass 'LIVE' explicitly so the card cannot be
   * mis-cited as paper evidence.
   */
  resultClass?: ResultClassName;
}

// ── Results ────────────────────────────────────────────────────────────────────

export interface BacktestTrade {
  timestamp: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  pnl: number | null;
}

export interface MetricsReport {
  /**
   * Net PnL in the units of the equity curve it was computed from.
   *
   * Two conventions coexist and callers must match them:
   * - alpha-lab path (experiment-engine, baseline-runner): return-on-capital
   *   fraction (e.g. 0.02 = +2% of entry capital). Equity curve starts at 1.0
   *   and compounds.
   * - polymarket path (shared/backtesting/backtest-runner): nominal USD.
   *   Equity curve starts at initialCapitalUsd and accumulates.
   *
   * `computeMetrics` does not convert between them — it reports whatever the
   * equity curve implies, so mixing conventions produces meaningless Sharpe and
   * drawdown values.
   */
  totalPnl: number;
  /** Annualized Sharpe ratio */
  sharpeRatio: number;
  /** Maximum drawdown as decimal (e.g. -0.123 = -12.3%) */
  maxDrawdown: number;
  /** Win rate as decimal (e.g. 0.58 = 58%) */
  winRate: number;
  /** Profit factor (gross profit / gross loss) */
  profitFactor: number;
  /** Total number of trades */
  totalTrades: number;
  /** Number of winning trades */
  winningTrades: number;
  /** Number of losing trades */
  losingTrades: number;
  /** Best single trade P&L */
  bestTrade: number;
  /** Worst single trade P&L */
  worstTrade: number;
  /** Average P&L per trade */
  avgPnlPerTrade: number;
}

export interface BacktestResult {
  /** Strategy name that was tested */
  strategy: StrategyName;
  /** Backtest configuration used */
  config: BacktestConfig;
  /** Computed metrics */
  metrics: MetricsReport;
  /** All individual trades */
  trades: BacktestTrade[];
  /** Equity curve: timestamp → equity value */
  equityCurve: Array<{ timestamp: string; equity: number }>;
  /** Timestamp when backtest started */
  startedAt: string;
  /** Timestamp when backtest completed */
  completedAt: string;
  /** Duration in ms */
  durationMs: number;
  /** Any warnings (e.g., insufficient data) */
  warnings: string[];
}

// ── Historical Data ────────────────────────────────────────────────────────────

export interface HistoricalSnapshot {
  timestamp: string;
  markets: HistoricalMarketData[];
}

export interface HistoricalMarketData {
  conditionId: string;
  question: string;
  yesTokenId?: string;
  noTokenId?: string;
  yesPrice: number;
  volume: number;
  liquidity: number;
  closed: boolean;
  endDate: string;
}
