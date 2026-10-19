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
import {
  calculateSmaSeries,
  calculateCrossoverConfidence,
  calculateRecentMomentum,
  createBuySignal,
  createSellSignal,
  createWaitSignal,
} from './02-sma-crossover-helpers';

export {
  calculateSmaSeries,
  calculateCrossoverConfidence,
  calculateRecentMomentum,
  createBuySignal,
  createSellSignal,
  createWaitSignal,
};

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
      return createWaitSignal(`Insufficient data: ${this.priceHistory.length}/${requiredCandles} candles`);
    }

    const closes = this.priceHistory.map(c => c.close);
    const fastSma = calculateSmaSeries(closes, this.fastPeriod);
    const slowSma = calculateSmaSeries(closes, this.slowPeriod);

    // Check for crossover
    const prevFast = calculateSmaSeries(closes.slice(0, -1), this.fastPeriod);
    const prevSlow = calculateSmaSeries(closes.slice(0, -1), this.slowPeriod);

    const currentFast = fastSma[fastSma.length - 1]!;
    const currentSlow = slowSma[slowSma.length - 1]!;
    const previousFast = prevFast[prevFast.length - 1]!;
    const previousSlow = prevSlow[prevSlow.length - 1]!;

    // Golden cross: fast crosses above slow
    if (previousFast <= previousSlow && currentFast > currentSlow) {
      const confidence = calculateCrossoverConfidence(currentFast, currentSlow, closes);
      if (confidence >= this.confidenceThreshold) {
        this.lastSignal = createBuySignal(confidence, 'SMA bullish crossover', {
          fastSma: currentFast,
          slowSma: currentSlow,
          period: `${this.fastPeriod}/${this.slowPeriod}`,
        });
        return this.lastSignal;
      }
    }

    // Death cross: fast crosses below slow
    if (previousFast >= previousSlow && currentFast < currentSlow) {
      const confidence = calculateCrossoverConfidence(currentSlow, currentFast, closes);
      if (confidence >= this.confidenceThreshold) {
        this.lastSignal = createSellSignal(confidence, 'SMA bearish crossover', {
          fastSma: currentFast,
          slowSma: currentSlow,
          period: `${this.fastPeriod}/${this.slowPeriod}`,
        });
        return this.lastSignal;
      }
    }

    // No clear signal
    return createWaitSignal('No SMA crossover detected', {
      fastSma: currentFast,
      slowSma: currentSlow,
      spread: currentFast - currentSlow,
    });
  }

  getStatus?(): Record<string, unknown> {
    const closes = this.priceHistory.map(c => c.close);
    const fastSma = calculateSmaSeries(closes, this.fastPeriod);
    const slowSma = calculateSmaSeries(closes, this.slowPeriod);

    return {
      name: STRATEGY_NAME,
      candles: this.priceHistory.length,
      fastSma: fastSma[fastSma.length - 1],
      slowSma: slowSma[slowSma.length - 1],
      lastSignal: this.lastSignal?.action ?? 'none',
    };
  }
}
