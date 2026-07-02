/**
 * Backtesting Types
 *
 * Shared types for the backtesting engine, CLI output, and platform API.
 */

import type { StrategyName } from '../core/types';
import type { BaseStrategyConfig } from '../strategies/polymarket/base-polymarket-strategy';

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
  /** Total P&L in USDC */
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
