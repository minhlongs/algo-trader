/**
 * Example 2: Simple Moving Average (SMA) Crossover Strategy
 *
 * This strategy demonstrates:
 * - Technical indicator calculation (SMA)
 * - Trading signal generation based on indicator crossovers
 * - Confidence scoring
 * - Position management
 *
 * STRATEGY LOGIC:
 * - Buy when fast SMA (10) crosses above slow SMA (30) → Bullish momentum
 * - Sell when fast SMA crosses below slow SMA → Bearish momentum
 * - Wait when SMAs are parallel (no clear trend)
 *
 * PARAMETERS TO TUNE:
 * - fastPeriod: Shorter timeframe for fast SMA (default: 10)
 * - slowPeriod: Longer timeframe for slow SMA (default: 30)
 * - confidenceThreshold: Minimum confidence to trade (default: 0.7)
 *
 * RISK CONSIDERATIONS:
 * - SMA crossover has lag → works best in trending markets
 * - Whipsaws in sideways markets → add volume confirmation
 * - Consider adding ATR-based stop-loss
 *
 * NEXT STEPS:
 * - Add RSI filter to avoid overbought/oversold conditions
 * - Implement trailing stop-loss
 * - Add volume confirmation
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy';
import { logger } from '../../../shared/utils/logger';

const STRATEGY_NAME = 'SmaCrossover';

export class SmaCrossoverStrategy implements IStrategy {
  private priceHistory: ICandle[] = [];
  private fastPeriod: number;
  private slowPeriod: number;
  private confidenceThreshold: number;
  private lastSignal: ISignal | null = null;

  constructor(opts?: {
    fastPeriod?: number;
    slowPeriod?: number;
    confidenceThreshold?: number;
  }) {
    this.fastPeriod = opts?.fastPeriod ?? 10;
    this.slowPeriod = opts?.slowPeriod ?? 30;
    this.confidenceThreshold = opts?.confidenceThreshold ?? 0.7;
  }

  getName(): string {
    return STRATEGY_NAME;
  }

  async initialize(): Promise<void> {
    logger.info('[SmaCrossover] Strategy initialized', {
      strategy: STRATEGY_NAME,
      fastPeriod: this.fastPeriod,
      slowPeriod: this.slowPeriod,
    });
  }

  async execute(candles: ICandle[]): Promise<ISignal> {
    this.priceHistory.push(...candles);
    this.priceHistory = this.priceHistory.slice(-200);

    const requiredCandles = Math.max(this.fastPeriod, this.slowPeriod);
    if (this.priceHistory.length < requiredCandles) {
      return this.waitSignal(`Insufficient data: ${this.priceHistory.length}/${requiredCandles} candles`);
    }

    const closes = this.priceHistory.map(c => c.close);
    const fastSma = this.calculateSma(closes, this.fastPeriod);
    const slowSma = this.calculateSma(closes, this.slowPeriod);

    // Check for crossover
    const prevFast = this.calculateSma(closes.slice(0, -1), this.fastPeriod);
    const prevSlow = this.calculateSma(closes.slice(0, -1), this.slowPeriod);

    const currentFast = fastSma[fastSma.length - 1]!;
    const currentSlow = slowSma[slowSma.length - 1]!;
    const previousFast = prevFast[prevFast.length - 1]!;
    const previousSlow = prevSlow[prevSlow.length - 1]!;

    // Golden cross: fast crosses above slow
    if (previousFast <= previousSlow && currentFast > currentSlow) {
      const confidence = this.calculateConfidence(currentFast, currentSlow, closes);
      if (confidence >= this.confidenceThreshold) {
        this.lastSignal = this.buySignal(confidence, 'SMA bullish crossover', {
          fastSma: currentFast,
          slowSma: currentSlow,
          period: `${this.fastPeriod}/${this.slowPeriod}`,
        });
        return this.lastSignal;
      }
    }

    // Death cross: fast crosses below slow
    if (previousFast >= previousSlow && currentFast < currentSlow) {
      const confidence = this.calculateConfidence(currentSlow, currentFast, closes);
      if (confidence >= this.confidenceThreshold) {
        this.lastSignal = this.sellSignal(confidence, 'SMA bearish crossover', {
          fastSma: currentFast,
          slowSma: currentSlow,
          period: `${this.fastPeriod}/${this.slowPeriod}`,
        });
        return this.lastSignal;
      }
    }

    // No clear signal
    return this.waitSignal('No SMA crossover detected', {
      fastSma: currentFast,
      slowSma: currentSlow,
      spread: currentFast - currentSlow,
    });
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSma(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  /**
   * Calculate confidence based on crossover strength
   */
  private calculateConfidence(primary: number, secondary: number, closes: number[]): number {
    const diff = primary - secondary;
    const avgPrice = closes[closes.length - 1]!;
    const spreadPercent = Math.abs(diff / avgPrice);

    // Base confidence from spread (0.5 - 1.0)
    const baseConfidence = 0.5 + Math.min(spreadPercent * 100, 0.5);

    // Add momentum component
    const recentReturns = this.calculateRecentMomentum(closes, 5);
    const momentumBoost = recentReturns > 0 ? 0.2 : 0;

    return Math.min(baseConfidence + momentumBoost, 1.0);
  }

  /**
   * Calculate recent price momentum
   */
  private calculateRecentMomentum(closes: number[], period: number): number {
    if (closes.length < period + 1) return 0;
    const current = closes[closes.length - 1]!;
    const previous = closes[closes.length - period - 1]!;
    return (current - previous) / previous;
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
    const fastSma = this.calculateSma(closes, this.fastPeriod);
    const slowSma = this.calculateSma(closes, this.slowPeriod);

    return {
      name: STRATEGY_NAME,
      candles: this.priceHistory.length,
      fastSma: fastSma[fastSma.length - 1],
      slowSma: slowSma[slowSma.length - 1],
      lastSignal: this.lastSignal?.action ?? 'none',
    };
  }
}
