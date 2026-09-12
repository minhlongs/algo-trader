/**
 * Example 5: Risk-Managed Kelly Criterion Strategy
 *
 * SMA crossover signals + Kelly Criterion position sizing + trailing stop-loss.
 * Risk: daily loss limit, max drawdown circuit breaker, volatility-adjusted sizing.
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy';
import { logger } from '../../../shared/utils/logger';
import {
  type RiskMetrics,
  calculateSma,
  calculateKellyPosition,
  checkRiskLimits,
  calculateDrawdown,
  checkTrailingStop,
} from './risk-managed-kelly-helpers';
import {
  createKellyPosition,
  createKellySignal,
  checkSmaCrossover,
  executeKellyClose,
  formatKellyStatus,
} from './risk-managed-kelly-lifecycle';

const STRATEGY_NAME = 'RiskManagedKelly';

export class RiskManagedKellyStrategy implements IStrategy {
  private priceHistory: ICandle[] = [];
  private riskMetrics: RiskMetrics = {
    dailyPnL: 0, peakBalance: 10000, currentBalance: 10000, openPosition: null,
  };

  private maxPositionPercent: number;
  private kellyFraction: number;
  private dailyLossLimitUsd: number;
  private maxDrawdownPercent: number;
  private trailingStopPercent: number;
  private lastSignalTime = 0;
  private signalCooldownMs = 60000;
  private winRate = 0.6;
  private winLossRatio = 1.5;
  private recentTrades: Array<{ pnl: number; timestamp: number }> = [];

  constructor(opts?: {
    maxPositionPercent?: number; kellyFraction?: number; dailyLossLimitUsd?: number;
    maxDrawdownPercent?: number; trailingStopPercent?: number;
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
      maxPositionPercent: `${this.maxPositionPercent * 100}%`,
      kellyFraction: this.kellyFraction,
      dailyLossLimit: this.dailyLossLimitUsd,
      maxDrawdown: `${this.maxDrawdownPercent * 100}%`,
    });
  }

  async execute(candles: ICandle[]): Promise<ISignal> {
    this.priceHistory.push(...candles);
    this.priceHistory = this.priceHistory.slice(-200);

    const currentPrice = candles[candles.length - 1]!.close;
    const currentTime = Date.now();

    const riskCheck = checkRiskLimits(this.riskMetrics, this.dailyLossLimitUsd, this.maxDrawdownPercent);
    if (!riskCheck.pass) {
      return this.waitSignal(`Risk limit hit: ${riskCheck.reason}`, {
        dailyPnL: this.riskMetrics.dailyPnL,
        drawdown: calculateDrawdown(this.riskMetrics.peakBalance, this.riskMetrics.currentBalance),
      });
    }

    if (this.riskMetrics.openPosition) {
      const stopResult = checkTrailingStop(this.riskMetrics.openPosition, currentPrice, this.trailingStopPercent);
      if (stopResult.triggered) {
        this.closePosition(currentPrice, 'trailing_stop');
        return this.sellSignal(1.0, 'Trailing stop triggered', stopResult.metadata);
      }
    }

    if (currentTime - this.lastSignalTime < this.signalCooldownMs) {
      return this.waitSignal('Signal cooldown active');
    }

    const kellyPosition = calculateKellyPosition(
      currentPrice, this.riskMetrics.currentBalance, this.winRate,
      this.winLossRatio, this.maxPositionPercent, this.kellyFraction, this.priceHistory,
    );

    const crossover = !this.riskMetrics.openPosition ? checkSmaCrossover(this.priceHistory) : null;
    if (crossover) {
      return this.openPosition(currentPrice, currentTime, kellyPosition, crossover);
    }

    return this.waitSignal('No signal', {
      sma10: calculateSma(this.priceHistory.map((c) => c.close), 10),
      sma30: calculateSma(this.priceHistory.map((c) => c.close), 30),
    });
  }

  private openPosition(
    currentPrice: number,
    currentTime: number,
    kellyPosition: { size: number; confidence: number; stopPercent: number },
    side: 'long' | 'short',
  ): ISignal {
    this.lastSignalTime = currentTime;
    const position = createKellyPosition(currentPrice, currentTime, kellyPosition, side);
    this.riskMetrics.openPosition = position;
    return createKellySignal(side, kellyPosition.confidence, position, this.kellyFraction, this.winRate);
  }

  private closePosition(exitPrice: number, reason: string): void {
    const position = this.riskMetrics.openPosition;
    if (!position) return;
    const { updatedMetrics, updatedTrades, winRate, winLossRatio, pnl } = executeKellyClose(
      position, exitPrice, this.riskMetrics, this.recentTrades,
    );
    this.riskMetrics = updatedMetrics;
    this.recentTrades = updatedTrades;
    this.winRate = winRate;
    this.winLossRatio = winLossRatio;
    logger.info('[RiskManagedKelly] Position closed', {
      reason, pnl: pnl.toFixed(2), balance: this.riskMetrics.currentBalance.toFixed(2), winRate: this.winRate.toFixed(2),
    });
  }

  private buySignal(confidence: number, reason: string, metadata?: Record<string, unknown>): ISignal {
    return { action: 'buy', confidence, reason, metadata };
  }

  private sellSignal(confidence: number, reason: string, metadata?: Record<string, unknown>): ISignal {
    return { action: 'sell', confidence, reason, metadata };
  }

  private waitSignal(reason: string, metadata?: Record<string, unknown>): ISignal {
    return { action: 'wait', confidence: 0, reason, metadata };
  }

  getStatus?(): Record<string, unknown> {
    return formatKellyStatus(STRATEGY_NAME, this.priceHistory, this.riskMetrics, this.winRate, this.winLossRatio);
  }
}
