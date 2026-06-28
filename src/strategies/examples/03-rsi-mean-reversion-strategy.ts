/**
 * Example 3: RSI (Relative Strength Index) Mean Reversion Strategy
 *
 * This strategy demonstrates:
 * - Technical indicator implementation (RSI)
 * - Mean reversion logic
 * - Overbought/oversold detection
 * - Position sizing based on signal strength
 *
 * STRATEGY LOGIC:
 * - Buy when RSI < 30 (oversold) and starting to rise
 * - Sell when RSI > 70 (overbought) and starting to fall
 * - Use RSI divergence for stronger signals
 *
 * PARAMETERS:
 * - rsiPeriod: RSI calculation period (default: 14)
 * - oversoldThreshold: Buy threshold (default: 30)
 * - overboughtThreshold: Sell threshold (default: 70)
 * - lookback: Bars to check for RSI turning point (default: 3)
 *
 * WHY MEAN REVERSION:
 * - Assets tend to revert to mean after extreme moves
 * - RSI identifies overbought/oversold conditions
 * - Adding confirmation of RSI turning point reduces whipsaws
 *
 * RISKS:
 * - Mean reversion fails in strong trends
 * - Consider adding trend filter (e.g., 200-period SMA)
 * - High volatility can keep RSI extreme longer
 *
 * NEXT STEPS:
 * - Add Bollinger Band confirmation
 * - Implement stop-loss based on ATR
 * - Add volume spike detection
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy.js';
import { logger } from '../../utils/logger.js';

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

    const closes = this.priceHistory.map(c => c.close);
    const requiredCandles = this.rsiPeriod + 1;

    if (closes.length < requiredCandles) {
      return this.waitSignal(`Insufficient data: ${closes.length}/${requiredCandles}`);
    }

    // Calculate RSI
    const rsi = this.calculateRsi(closes);
    this.rsiValues.push(rsi);
    this.rsiValues = this.rsiValues.slice(-200);

    if (this.rsiValues.length < this.lookback) {
      return this.waitSignal(`Building RSI history: ${this.rsiValues.length}/${this.lookback}`);
    }

    const currentRsi = rsi;
    const recentRsi = this.rsiValues.slice(-this.lookback);

    // Check for oversold recovery (buy signal)
    if (currentRsi > this.oversold && this.wasRecentlyOversold(recentRsi)) {
      // RSI was oversold and now recovering
      const confidence = this.calculateBuyConfidence(currentRsi, recentRsi, closes);
      if (confidence > 0.5) {
        return this.buySignal(confidence, 'RSI oversold recovery', {
          rsi: currentRsi,
          oversoldThreshold: this.oversold,
        });
      }
    }

    // Check for overbought rollover (sell signal)
    if (currentRsi < this.overbought && this.wasRecentlyOverbought(recentRsi)) {
      // RSI was overbought and now rolling over
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

  /**
   * Calculate RSI using the Wilder's smoothing method
   */
  private calculateRsi(closes: number[]): number {
    const recent = closes.slice(-this.rsiPeriod - 1);
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < recent.length; i++) {
      const change = recent[i] - recent[i - 1]!;
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }

    const avgGain = gains.reduce((a, b) => a + b, 0) / this.rsiPeriod;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / this.rsiPeriod;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /**
   * Check if RSI was recently oversold (below threshold)
   */
  private wasRecentlyOversold(rsiValues: number[]): boolean {
    // Check if any value in lookback window was below oversold threshold
    return rsiValues.slice(0, -1).some(r => r < this.oversold);
  }

  /**
   * Check if RSI was recently overbought (above threshold)
   */
  private wasRecentlyOverbought(rsiValues: number[]): boolean {
    return rsiValues.slice(0, -1).some(r => r > this.overbought);
  }

  /**
   * Calculate buy confidence based on RSI depth and recovery strength
   */
  private calculateBuyConfidence(current: number, recent: number[], closes: number[]): number {
    const minRsi = Math.min(...recent);
    const depth = this.oversold - minRsi; // How deep into oversold
    const baseConfidence = 0.6 + Math.min(depth / 20, 0.3);

    // Add momentum component
    const momentum = current - recent[recent.length - 2]!;
    const momentumBoost = momentum > 0 ? 0.1 : 0;

    return Math.min(baseConfidence + momentumBoost, 1.0);
  }

  /**
   * Calculate sell confidence based on RSI height and rollover strength
   */
  private calculateSellConfidence(current: number, recent: number[], closes: number[]): number {
    const maxRsi = Math.max(...recent);
    const height = maxRsi - this.overbought; // How high into overbought
    const baseConfidence = 0.6 + Math.min(height / 20, 0.3);

    // Add momentum component
    const momentum = current - recent[recent.length - 2]!;
    const momentumBoost = momentum < 0 ? 0.1 : 0;

    return Math.min(baseConfidence + momentumBoost, 1.0);
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
