/**
 * Capital Readiness Tracker
 * Validates whether the trading system has sufficient capital, track record,
 * and risk posture to transition from paper trading to live.
 */

import { logger } from '../../shared/utils/logger';

export interface CapitalReadinessConfig {
  /** Minimum capital in USD required to go live */
  minCapitalUsd: number;
  /** Minimum number of days of paper trading required */
  minPaperDays: number;
  /** Maximum allowable drawdown percentage (0-100) */
  maxDrawdownPct: number;
  /** Minimum win rate required (0-1) */
  minWinRate: number;
}

export interface TradeRecord {
  /** ISO date string of the trade */
  date: string;
  /** Profit/loss in USD */
  pnlUsd: number;
  /** Whether this was a paper trade */
  isPaper: boolean;
}

export interface CapitalReadinessState {
  /** Current capital in USD */
  capitalUsd: number;
  /** Number of days with paper trading activity */
  paperTradingDays: number;
  /** Maximum drawdown percentage observed (0-100) */
  maxDrawdownPct: number;
  /** Win rate across all recorded trades (0-1) */
  winRate: number;
  /** Whether all readiness conditions are met */
  isReady: boolean;
  /** Human-readable reasons for not being ready */
  blockers: string[];
}

/** Default readiness thresholds for go-live validation */
export const DEFAULT_CAPITAL_READINESS_CONFIG: CapitalReadinessConfig = {
  minCapitalUsd: 10_000,
  minPaperDays: 30,
  maxDrawdownPct: 15,
  minWinRate: 0.55,
};

/**
 * Tracks whether the trading system has sufficient capital and track record
 * to go live. Evaluates capital level, paper trading duration, drawdown limits,
 * and win rate against configurable thresholds.
 */
export class CapitalReadinessTracker {
  private config: CapitalReadinessConfig;
  private capitalUsd: number = 0;
  private trades: TradeRecord[] = [];
  private paperDays: Set<string> = new Set();
  private peakEquity: number = 0;
  private currentEquity: number = 0;

  constructor(config: CapitalReadinessConfig) {
    this.config = config;
  }

  /**
   * Update the current capital level.
   * @param usd - Current capital in USD
   */
  updateCapital(usd: number): void {
    this.capitalUsd = usd;
    if (usd > this.peakEquity) {
      this.peakEquity = usd;
    }
    this.currentEquity = usd;
    logger.info(`[CapitalReadiness] Capital updated: $${usd}`);
  }

  /**
   * Record a trade result and track paper trading days.
   * @param trade - Trade record with date, PnL, and paper flag
   */
  recordTrade(trade: TradeRecord): void {
    this.trades.push(trade);

    if (trade.isPaper) {
      const dayKey = trade.date.slice(0, 10);
      this.paperDays.add(dayKey);
    }

    // Update equity tracking for drawdown calculation
    this.currentEquity += trade.pnlUsd;
    if (this.currentEquity > this.peakEquity) {
      this.peakEquity = this.currentEquity;
    }

    logger.info(
      `[CapitalReadiness] Trade recorded: PnL $${trade.pnlUsd}, paper=${trade.isPaper}`
    );
  }

  /**
   * Evaluate all readiness conditions and return current state with blockers.
   * @returns Current capital readiness state with pass/fail per condition
   */
  evaluate(): CapitalReadinessState {
    const blockers: string[] = [];
    const paperTradingDays = this.paperDays.size;

    // Check capital requirement
    if (this.capitalUsd < this.config.minCapitalUsd) {
      blockers.push(
        `Capital $${this.capitalUsd} below minimum $${this.config.minCapitalUsd}`
      );
    }

    // Check paper trading duration
    if (paperTradingDays < this.config.minPaperDays) {
      blockers.push(
        `Paper trading ${paperTradingDays} days below minimum ${this.config.minPaperDays} days`
      );
    }

    // Check drawdown
    const maxDrawdownPct = this.calculateMaxDrawdown();
    if (maxDrawdownPct > this.config.maxDrawdownPct) {
      blockers.push(
        `Drawdown ${maxDrawdownPct.toFixed(2)}% exceeds maximum ${this.config.maxDrawdownPct}%`
      );
    }

    // Check win rate (only if trades exist)
    const winRate = this.calculateWinRate();
    if (this.trades.length > 0 && winRate < this.config.minWinRate) {
      blockers.push(
        `Win rate ${(winRate * 100).toFixed(1)}% below minimum ${(this.config.minWinRate * 100).toFixed(1)}%`
      );
    }

    const isReady = blockers.length === 0;

    const state: CapitalReadinessState = {
      capitalUsd: this.capitalUsd,
      paperTradingDays,
      maxDrawdownPct,
      winRate,
      isReady,
      blockers,
    };

    logger.info(
      `[CapitalReadiness] Evaluation: ${isReady ? 'READY' : `NOT READY (${blockers.length} blockers)`}`
    );

    return state;
  }

  /**
   * Calculate maximum drawdown percentage from peak equity.
   * @returns Maximum drawdown as a percentage (0-100)
   */
  private calculateMaxDrawdown(): number {
    if (this.peakEquity <= 0) return 0;
    const drawdownUsd = this.peakEquity - this.currentEquity;
    return (drawdownUsd / this.peakEquity) * 100;
  }

  /**
   * Calculate win rate across all recorded trades.
   * @returns Win rate as a fraction (0-1)
   */
  private calculateWinRate(): number {
    if (this.trades.length === 0) return 0;
    const winners = this.trades.filter((t) => t.pnlUsd > 0).length;
    return winners / this.trades.length;
  }
}
