/**
 * Example 3: RSI (Relative Strength Index) Mean Reversion Strategy
 * Buys on oversold recovery, sells on overbought rollover.
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy';
import { logger } from '../../../shared/utils/logger';
import {
  calculateWilderRsi,
  wasRecentlyOversold,
  wasRecentlyOverbought,
  calculateRsiBuyConfidence,
  calculateRsiSellConfidence,
} from './03-rsi-indicator';

const STRATEGY_NAME = 'RsiMeanReversion';

export class RsiMeanReversionStrategy implements IStrategy {
  private priceHistory: ICandle[] = [];
  private rsiPeriod: number;
  private oversold: number;
  private overbought: number;
  private lookback: number;
  private rsiValues: number[] = [];

  constructor(opts?: {
    rsiPeriod?: number;
    oversoldThreshold?: number;
    overboughtThreshold?: number;
    lookback?: number;
  }) {
    this.rsiPeriod = opts?.rsiPeriod ?? 14;
    this.oversold = opts?.oversoldThreshold ?? 30;
    this.overbought = opts?.overboughtThreshold ?? 70;
    this.lookback = opts?.lookback ?? 3;
  }

  getName(): string {
    return STRATEGY_NAME;
  }

  async initialize(): Promise<void> {
    logger.info('[RsiMeanReversion] Strategy initialized', {
      strategy: STRATEGY_NAME,
      rsiPeriod: this.rsiPeriod,
      oversold: this.oversold,
      overbought: this.overbought,
    });
  }

  async execute(candles: ICandle[]): Promise<ISignal> {
    this.priceHistory.push(...candles);
    this.priceHistory = this.priceHistory.slice(-300);

    const closes = this.priceHistory.map((c) => c.close);
    const requiredCandles = this.rsiPeriod + 1;

    if (closes.length < requiredCandles) {
      return this.waitSignal(`Insufficient data: ${closes.length}/${requiredCandles}`);
    }

    const rsi = this.calculateRsi(closes);
    this.rsiValues.push(rsi);
    this.rsiValues = this.rsiValues.slice(-200);

    if (this.rsiValues.length < this.lookback) {
      return this.waitSignal(`Building RSI history: ${this.rsiValues.length}/${this.lookback}`);
    }

    const currentRsi = rsi;
    const recentRsi = this.rsiValues.slice(-this.lookback);

    if (currentRsi > this.oversold && this.wasRecentlyOversold(recentRsi)) {
      const confidence = this.calculateBuyConfidence(currentRsi, recentRsi, closes);
      if (confidence > 0.5) {
        return this.buySignal(confidence, 'RSI oversold recovery', {
          rsi: currentRsi,
          oversoldThreshold: this.oversold,
        });
      }
    }

    if (currentRsi < this.overbought && this.wasRecentlyOverbought(recentRsi)) {
      const confidence = this.calculateSellConfidence(currentRsi, recentRsi, closes);
      if (confidence > 0.5) {
        return this.sellSignal(confidence, 'RSI overbought rollover', {
          rsi: currentRsi,
          overboughtThreshold: this.overbought,
        });
      }
    }

    return this.waitSignal('No RSI signal', { rsi: currentRsi });
  }

  private calculateRsi(closes: number[]): number {
    return calculateWilderRsi(closes, this.rsiPeriod);
  }

  private wasRecentlyOversold(rsiValues: number[]): boolean {
    return wasRecentlyOversold(rsiValues, this.oversold);
  }

  private wasRecentlyOverbought(rsiValues: number[]): boolean {
    return wasRecentlyOverbought(rsiValues, this.overbought);
  }

  private calculateBuyConfidence(current: number, recent: number[], _closes: number[]): number {
    return calculateRsiBuyConfidence(current, recent, this.oversold);
  }

  private calculateSellConfidence(current: number, recent: number[], _closes: number[]): number {
    return calculateRsiSellConfidence(current, recent, this.overbought);
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
    return {
      name: STRATEGY_NAME,
      candles: this.priceHistory.length,
      currentRsi: this.rsiValues[this.rsiValues.length - 1] ?? null,
      oversoldThreshold: this.oversold,
      overboughtThreshold: this.overbought,
    };
  }
}
