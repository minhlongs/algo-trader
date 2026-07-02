/**
 * Example 5: Risk-Managed Kelly Criterion Strategy
 *
 * SMA crossover signals + Kelly Criterion position sizing + trailing stop-loss.
 * Risk: daily loss limit, max drawdown circuit breaker, volatility-adjusted sizing.
 * Calculation helpers extracted to risk-managed-kelly-helpers.ts.
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy';
import { logger } from '../../../shared/utils/logger';
import {
  type Position,
  type RiskMetrics,
  calculateSma,
  calculateKellyPosition,
  checkRiskLimits,
  calculateDrawdown,
  checkTrailingStop,
  closePositionResult,
  updateWinStats,
} from './risk-managed-kelly-helpers';

const STRATEGY_NAME = 'RiskManagedKelly';

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
    const riskCheck = checkRiskLimits(this.riskMetrics, this.dailyLossLimitUsd, this.maxDrawdownPercent);
    if (!riskCheck.pass) {
      return this.waitSignal(`Risk limit hit: ${riskCheck.reason}`, {
        dailyPnL: this.riskMetrics.dailyPnL,
        drawdown: calculateDrawdown(this.riskMetrics.peakBalance, this.riskMetrics.currentBalance),
      });
    }

    // Check trailing stop if position open
    if (this.riskMetrics.openPosition) {
      const stopResult = checkTrailingStop(
        this.riskMetrics.openPosition,
        currentPrice,
        this.trailingStopPercent,
      );
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
    const kellyPosition = calculateKellyPosition(
      currentPrice,
      this.riskMetrics.currentBalance,
      this.winRate,
      this.winLossRatio,
      this.maxPositionPercent,
      this.kellyFraction,
      this.priceHistory,
    );

    // Entry logic: SMA crossover
    if (this.priceHistory.length >= 30) {
      const closes = this.priceHistory.map(c => c.close);
      const sma10 = calculateSma(closes, 10);
      const sma30 = calculateSma(closes, 30);
      const prevSma10 = calculateSma(closes.slice(0, -1), 10);
      const prevSma30 = calculateSma(closes.slice(0, -1), 30);

      // Bullish crossover
      if (prevSma10 <= prevSma30 && sma10 > sma30 && !this.riskMetrics.openPosition) {
        return this.openPosition(currentPrice, currentTime, kellyPosition, 'long', sma10, sma30);
      }

      // Bearish crossover
      if (prevSma10 >= prevSma30 && sma10 < sma30 && !this.riskMetrics.openPosition) {
        return this.openPosition(currentPrice, currentTime, kellyPosition, 'short', sma10, sma30);
      }
    }

    return this.waitSignal('No signal', {
      sma10: calculateSma(this.priceHistory.map(c => c.close), 10),
      sma30: calculateSma(this.priceHistory.map(c => c.close), 30),
    });
  }

  private openPosition(
    currentPrice: number,
    currentTime: number,
    kellyPosition: { size: number; confidence: number; stopPercent: number },
    side: 'long' | 'short',
    _sma10: number,
    _sma30: number,
  ): ISignal {
    this.lastSignalTime = currentTime;
    const position: Position = {
      entryPrice: currentPrice,
      size: kellyPosition.size,
      stopLoss: currentPrice * (1 - kellyPosition.stopPercent),
      takeProfit: currentPrice * (1 + kellyPosition.stopPercent * 2),
      side,
      timestamp: currentTime,
    };
    this.riskMetrics.openPosition = position;

    const crossoverLabel = side === 'long' ? 'bullish' : 'bearish';
    return side === 'long'
      ? this.buySignal(kellyPosition.confidence, `SMA ${crossoverLabel} crossover + Kelly sizing`, {
          size: position.size, stopLoss: position.stopLoss, takeProfit: position.takeProfit,
          kellyFraction: this.kellyFraction, confidence: this.winRate,
        })
      : this.sellSignal(kellyPosition.confidence, `SMA ${crossoverLabel} crossover + Kelly sizing`, {
          size: position.size, stopLoss: position.stopLoss, takeProfit: position.takeProfit,
          kellyFraction: this.kellyFraction, confidence: this.winRate,
        });
  }

  /**
   * Close position and update metrics
   */
  private closePosition(exitPrice: number, reason: string): void {
    const position = this.riskMetrics.openPosition;
    if (!position) return;

    const { updatedMetrics, updatedTrades, pnl } = closePositionResult(
      position,
      exitPrice,
      this.riskMetrics,
      this.recentTrades,
    );

    this.riskMetrics = updatedMetrics;
    this.recentTrades = updatedTrades;

    // Update win rate and win/loss ratio
    const { winRate, winLossRatio } = updateWinStats(this.recentTrades);
    this.winRate = winRate;
    this.winLossRatio = winLossRatio;

    logger.info('[RiskManagedKelly] Position closed', {
      reason,
      pnl: pnl.toFixed(2),
      balance: this.riskMetrics.currentBalance.toFixed(2),
      winRate: this.winRate.toFixed(2),
    });
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
      drawdown: calculateDrawdown(this.riskMetrics.peakBalance, this.riskMetrics.currentBalance),
      peakBalance: this.riskMetrics.peakBalance,
      openPosition: this.riskMetrics.openPosition,
      sma10: calculateSma(closes, 10),
      sma30: calculateSma(closes, 30),
      winRate: this.winRate,
      winLossRatio: this.winLossRatio,
    };
  }
}
