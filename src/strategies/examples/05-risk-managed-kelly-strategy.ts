/**
 * Example 5: Risk-Managed Kelly Criterion Strategy
 *
 * This strategy demonstrates:
 * - Kelly Criterion for position sizing
 * - Dynamic risk adjustment based on account performance
 * - Stop-loss and take-profit management
 * - Maximum drawdown protection
 *
 * STRATEGY LOGIC:
 * - Uses SMA crossover for entry/exit signals
 * - Kelly Criterion to determine optimal position size
 * - Trailing stop-loss for profit protection
 * - Daily loss limits to prevent catastrophic drawdown
 *
 * WHAT IS KELLY CRITERION?
 * The Kelly formula optimizes long-term growth by sizing bets based on:
 *   f* = (p * b - q) / b
 *   where:
 *   - p = win probability
 *   - b = win/loss ratio
 *   - q = 1 - p
 *
 * In trading, we modify for risk management:
 *   positionSize = accountBalance * (kellyFraction * kellyFraction * confidence)
 *
 * RISK MANAGEMENT FEATURES:
 * 1. Max position size per trade (prevokes over-concentration)
 * 2. Daily loss limit (stops trading after threshold)
 * 3. Maximum drawdown circuit breaker
 * 4. Trailing stop-loss (locks in profits)
 * 5. Volatility-adjusted position sizing
 *
 * PARAMETERS:
 * - maxPositionPercent: Max % of account at risk (default: 0.02 = 2%)
 * - kellyFraction: Conservative fraction of Kelly (default: 0.25)
 * - dailyLossLimitUsd: Stop trading after this loss (default: 500)
 * - maxDrawdownPercent: Circuit breaker (default: 0.10 = 10%)
 * - trailingStopPercent: Trailing stop offset (default: 0.02 = 2%)
 *
 * IMPORTANT CONCEPTS:
 * - Kelly Criterion maximizes log utility growth
 * - "Fractional Kelly" (0.5x or 0.25x) is more robust to estimation errors
 * - Volatility adjustment reduces size in turbulent markets
 * - Trailing stop locks in gains and removes emotion
 *
 * NEXT STEPS:
 * - Add ATR-based stop-loss instead of fixed percentage
 * - Implement position scaling (pyramiding)
 * - Add correlation limits for multi-strategy portfolios
 * - Incorporate expected shortfall (CVaR) for tail risk
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy.js';
import { logger } from '../../shared/utils/logger.js';

const STRATEGY_NAME = 'RiskManagedKelly';

interface Position {
  entryPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  side: 'long' | 'short';
  timestamp: number;
}

interface RiskMetrics {
  dailyPnL: number;
  peakBalance: number;
  currentBalance: number;
  openPosition: Position | null;
}

export class RiskManagedKellyStrategy implements IStrategy {
  private priceHistory: ICandle[] = [];
  private riskMetrics: RiskMetrics = {
    dailyPnL: 0,
    peakBalance: 10000,
    currentBalance: 10000,
    openPosition: null,
  };

  // Kelly parameters
  private maxPositionPercent: number;
  private kellyFraction: number;
  private dailyLossLimitUsd: number;
  private maxDrawdownPercent: number;
  private trailingStopPercent: number;

  // Strategy state
  private lastSignalTime = 0;
  private signalCooldownMs = 60000; // 1 minute cooldown
  private winRate = 0.6; // Estimated from backtest, will update in real-time
  private winLossRatio = 1.5; // Average win / average loss
  private recentTrades: Array<{ pnl: number; timestamp: number }> = [];

  constructor(opts?: {
    maxPositionPercent?: number;
    kellyFraction?: number;
    dailyLossLimitUsd?: number;
    maxDrawdownPercent?: number;
    trailingStopPercent?: number;
  }) {
    this.maxPositionPercent = opts?.maxPositionPercent ?? 0.02;
    this.kellyFraction = opts?.kellyFraction ?? 0.25;
    this.dailyLossLimitUsd = opts?.dailyLossLimitUsd ?? 500;
    this.maxDrawdownPercent = opts?.maxDrawdownPercent ?? 0.10;
    this.trailingStopPercent = opts?.trailingStopPercent ?? 0.02;
  }

  getName(): string {
    return STRATEGY_NAME;
  }

  async initialize(): Promise<void> {
    logger.info('[RiskManagedKelly] Strategy initialized', {
      strategy: STRATEGY_NAME,
      maxPositionPercent: this.maxPositionPercent * 100 + '%',
      kellyFraction: this.kellyFraction,
      dailyLossLimit: this.dailyLossLimitUsd,
      maxDrawdown: this.maxDrawdownPercent * 100 + '%',
    });
  }

  async execute(candles: ICandle[]): Promise<ISignal> {
    this.priceHistory.push(...candles);
    this.priceHistory = this.priceHistory.slice(-200);

    const currentPrice = candles[candles.length - 1]!.close;
    const currentTime = Date.now();

    // Check risk limits first
    const riskCheck = this.checkRiskLimits();
    if (!riskCheck.pass) {
      return this.waitSignal(`Risk limit hit: ${riskCheck.reason}`, {
        dailyPnL: this.riskMetrics.dailyPnL,
        drawdown: this.calculateDrawdown(),
      });
    }

    // Check trailing stop if position open
    if (this.riskMetrics.openPosition) {
      const stopResult = this.checkTrailingStop(currentPrice);
      if (stopResult.triggered) {
        this.closePosition(currentPrice, 'trailing_stop');
        return this.sellSignal(1.0, 'Trailing stop triggered', stopResult.metadata);
      }
    }

    // Cooldown period
    if (currentTime - this.lastSignalTime < this.signalCooldownMs) {
      return this.waitSignal('Signal cooldown active');
    }

    // Calculate Kelly position size
    const kellyPosition = this.calculateKellyPosition(currentPrice);

    // Entry logic: SMA crossover
    if (this.priceHistory.length >= 30) {
      const closes = this.priceHistory.map(c => c.close);
      const sma10 = this.calculateSma(closes, 10);
      const sma30 = this.calculateSma(closes, 30);
      const prevSma10 = this.calculateSma(closes.slice(0, -1), 10);
      const prevSma30 = this.calculateSma(closes.slice(0, -1), 30);

      // Bullish crossover
      if (prevSma10 <= prevSma30 && sma10 > sma30 && !this.riskMetrics.openPosition) {
        this.lastSignalTime = currentTime;
        const position: Position = {
          entryPrice: currentPrice,
          size: kellyPosition.size,
          stopLoss: currentPrice * (1 - kellyPosition.stopPercent),
          takeProfit: currentPrice * (1 + kellyPosition.stopPercent * 2), // 2:1 reward/risk
          side: 'long',
          timestamp: currentTime,
        };
        this.riskMetrics.openPosition = position;

        return this.buySignal(kellyPosition.confidence, 'SMA bullish crossover + Kelly sizing', {
          size: position.size,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          kellyFraction: this.kellyFraction,
          confidence: this.winRate,
        });
      }

      // Bearish crossover
      if (prevSma10 >= prevSma30 && sma10 < sma30 && !this.riskMetrics.openPosition) {
        this.lastSignalTime = currentTime;
        const position: Position = {
          entryPrice: currentPrice,
          size: kellyPosition.size,
          stopLoss: currentPrice * (1 + kellyPosition.stopPercent),
          takeProfit: currentPrice * (1 - kellyPosition.stopPercent * 2),
          side: 'short',
          timestamp: currentTime,
        };
        this.riskMetrics.openPosition = position;

        return this.sellSignal(kellyPosition.confidence, 'SMA bearish crossover + Kelly sizing', {
          size: position.size,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          kellyFraction: this.kellyFraction,
          confidence: this.winRate,
        });
      }
    }

    return this.waitSignal('No signal', {
      sma10: this.calculateSma(this.priceHistory.map(c => c.close), 10),
      sma30: this.calculateSma(this.priceHistory.map(c => c.close), 30),
    });
  }

  /**
   * Calculate Kelly Criterion position size
   */
  private calculateKellyPosition(currentPrice: number): { size: number; confidence: number; stopPercent: number } {
    // Kelly formula: f* = (p * b - q) / b
    // Using fractional Kelly for safety
    const p = this.winRate;
    const b = this.winLossRatio;
    const q = 1 - p;

    const kellyFraction = p > 0 && b > 0 ? (p * b - q) / b : 0;
    const fractionalKelly = Math.max(0, kellyFraction * this.kellyFraction);

    // Adjust for volatility
    const volatility = this.calculateRecentVolatility(this.priceHistory, 20);
    const volatilityAdjustment = Math.max(0.5, 1 - volatility * 10); // Reduce size in high volatility

    // Final position size as % of balance
    const positionPercent = fractionalKelly * this.maxPositionPercent * volatilityAdjustment;

    // Calculate position size in units
    const positionSizeUsd = this.riskMetrics.currentBalance * positionPercent;
    const positionSize = positionSizeUsd / currentPrice;

    // Dynamic stop based on ATR
    const atr = this.calculateAtr(this.priceHistory, 14);
    const stopDistance = atr * 2; // 2x ATR stop
    const stopPercent = stopDistance / currentPrice;

    return {
      size: positionSize,
      confidence: this.winRate * (1 - volatility),
      stopPercent: Math.min(stopPercent, 0.05), // Cap at 5% stop
    };
  }

  /**
   * Check all risk limits
   */
  private checkRiskLimits(): { pass: boolean; reason?: string } {
    // Daily loss limit
    if (Math.abs(this.riskMetrics.dailyPnL) > this.dailyLossLimitUsd && this.riskMetrics.dailyPnL < 0) {
      return { pass: false, reason: `Daily loss limit hit: ${this.riskMetrics.dailyPnL.toFixed(2)}` };
    }

    // Drawdown limit
    const drawdown = this.calculateDrawdown();
    if (drawdown > this.maxDrawdownPercent) {
      return { pass: false, reason: `Max drawdown hit: ${(drawdown * 100).toFixed(2)}%` };
    }

    return { pass: true };
  }

  /**
   * Calculate current drawdown from peak
   */
  private calculateDrawdown(): number {
    const peak = this.riskMetrics.peakBalance;
    const current = this.riskMetrics.currentBalance;
    return (peak - current) / peak;
  }

  /**
   * Check if trailing stop should trigger
   */
  private checkTrailingStop(currentPrice: number): { triggered: boolean; metadata?: Record<string, any> } {
    const position = this.riskMetrics.openPosition;
    if (!position) return { triggered: false };

    let stopPrice: number;

    if (position.side === 'long') {
      // For long, trail above price
      const trailPrice = currentPrice * (1 - this.trailingStopPercent);
      stopPrice = Math.max(position.stopLoss, trailPrice);
      if (currentPrice <= stopPrice) {
        return { triggered: true, metadata: { stopPrice, pnl: currentPrice - position.entryPrice } };
      }
    } else {
      // For short, trail below price
      const trailPrice = currentPrice * (1 + this.trailingStopPercent);
      stopPrice = Math.min(position.stopLoss, trailPrice);
      if (currentPrice >= stopPrice) {
        return { triggered: true, metadata: { stopPrice, pnl: position.entryPrice - currentPrice } };
      }
    }

    return { triggered: false };
  }

  /**
   * Close position and update metrics
   */
  private closePosition(exitPrice: number, reason: string): void {
    const position = this.riskMetrics.openPosition;
    if (!position) return;

    let pnl = 0;
    if (position.side === 'long') {
      pnl = (exitPrice - position.entryPrice) * position.size;
    } else {
      pnl = (position.entryPrice - exitPrice) * position.size;
    }

    this.riskMetrics.dailyPnL += pnl;
    this.riskMetrics.currentBalance += pnl;
    this.riskMetrics.peakBalance = Math.max(this.riskMetrics.peakBalance, this.riskMetrics.currentBalance);

    this.recentTrades.push({ pnl, timestamp: Date.now() });
    this.recentTrades = this.recentTrades.filter(t => Date.now() - t.timestamp < 24 * 60 * 60 * 1000);

    // Update win rate and win/loss ratio
    this.updateWinStats();

    logger.info('[RiskManagedKelly] Position closed', {
      reason,
      pnl: pnl.toFixed(2),
      balance: this.riskMetrics.currentBalance.toFixed(2),
      winRate: this.winRate.toFixed(2),
    });

    this.riskMetrics.openPosition = null;
  }

  /**
   * Update win rate and win/loss ratio from recent trades
   */
  private updateWinStats(): void {
    if (this.recentTrades.length < 5) return;

    const wins = this.recentTrades.filter(t => t.pnl > 0);
    const losses = this.recentTrades.filter(t => t.pnl <= 0);

    this.winRate = wins.length / this.recentTrades.length;

    if (losses.length > 0) {
      const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + Math.abs(b.pnl), 0) / wins.length : 0;
      const avgLoss = losses.reduce((a, b) => a + Math.abs(b.pnl), 0) / losses.length;
      this.winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1.5;
    }
  }

  private calculateSma(data: number[], period: number): number {
    const recent = data.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / period;
  }

  private calculateAtr(candles: ICandle[], period: number): number {
    const atrValues: number[] = [];
    for (let i = 1; i < Math.min(candles.length, period + 1); i++) {
      const current = candles[i]!;
      const previous = candles[i - 1]!;
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      );
      atrValues.push(tr);
    }
    return atrValues.reduce((a, b) => a + b, 0) / atrValues.length;
  }

  private calculateRecentVolatility(candles: ICandle[], period: number): number {
    const closes = candles.slice(-period).map(c => c.close);
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    const squaredDiffs = closes.map(c => Math.pow(c - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / closes.length;
    return Math.sqrt(variance) / mean;
  }

  private buySignal(confidence: number, reason: string, metadata?: Record<string, any>): ISignal {
    return { action: 'buy', confidence, reason, metadata };
  }

  private sellSignal(confidence: number, reason: string, metadata?: Record<string, any>): ISignal {
    return { action: 'sell', confidence, reason, metadata };
  }

  private waitSignal(reason: string, metadata?: Record<string, any>): ISignal {
    return { action: 'wait', confidence: 0, reason, metadata };
  }

  getStatus?(): Record<string, any> {
    const closes = this.priceHistory.map(c => c.close);
    return {
      name: STRATEGY_NAME,
      candles: this.priceHistory.length,
      balance: this.riskMetrics.currentBalance,
      dailyPnL: this.riskMetrics.dailyPnL,
      drawdown: this.calculateDrawdown(),
      peakBalance: this.riskMetrics.peakBalance,
      openPosition: this.riskMetrics.openPosition,
      sma10: this.calculateSma(closes, 10),
      sma30: this.calculateSma(closes, 30),
      winRate: this.winRate,
      winLossRatio: this.winLossRatio,
    };
  }
}
