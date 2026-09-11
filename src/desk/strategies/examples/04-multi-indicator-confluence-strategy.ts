/**
 * Example 4: Multi-Indicator Confluence Strategy
 *
 * This strategy demonstrates:
 * - Combining multiple technical indicators
 * - Signal weighting and voting system
 * - Risk-adjusted position sizing
 * - Correlation and confirmation requirements
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy';
import { logger } from '../../../shared/utils/logger';
import type { MultiIndicatorOptions, IndicatorSignals } from './04-multi-indicator-confluence-types';
import { calculateEma, calculateRsi } from './04-multi-indicator-confluence-math';
import {
  computeIndicatorSignals,
  evaluateConfluence,
  calculateConfidence,
} from './04-multi-indicator-confluence-evaluator';

export type { IndicatorSignals, MultiIndicatorOptions, ConfluenceResult } from './04-multi-indicator-confluence-types';
export {
  calculateEma,
  calculateRsi,
  calculateSma,
  calculateStd,
} from './04-multi-indicator-confluence-math';
export {
  computeIndicatorSignals,
  evaluateConfluence,
  calculateConfidence,
} from './04-multi-indicator-confluence-evaluator';

const STRATEGY_NAME = 'MultiIndicatorConfluence';

export class MultiIndicatorConfluenceStrategy implements IStrategy {
  private priceHistory: ICandle[] = [];
  private volumeHistory: number[] = [];
  private emaFast: number;
  private emaSlow: number;
  private rsiPeriod: number;
  private minConfluence: number;
  private volatilityThreshold: number;
  private bbPeriod: number;
  private bbStdDev: number;

  constructor(opts?: MultiIndicatorOptions) {
    this.emaFast = opts?.emaFast ?? 12;
    this.emaSlow = opts?.emaSlow ?? 26;
    this.rsiPeriod = opts?.rsiPeriod ?? 14;
    this.minConfluence = opts?.minConfluence ?? 3;
    this.volatilityThreshold = opts?.volatilityThreshold ?? 0.02;
    this.bbPeriod = 20;
    this.bbStdDev = 2;
  }

  getName(): string {
    return STRATEGY_NAME;
  }

  async initialize(): Promise<void> {
    logger.info('[MultiIndicator] Strategy initialized', {
      strategy: STRATEGY_NAME,
      emaFast: this.emaFast,
      emaSlow: this.emaSlow,
      rsiPeriod: this.rsiPeriod,
      minConfluence: this.minConfluence,
    });
  }

  async execute(candles: ICandle[]): Promise<ISignal> {
    this.priceHistory.push(...candles);
    this.priceHistory = this.priceHistory.slice(-300);
    this.volumeHistory = this.volumeHistory.slice(-300);

    const closes = this.priceHistory.map(c => c.close);
    const volumes = this.priceHistory.map(c => c.volume);

    const required = Math.max(this.emaSlow, this.rsiPeriod, this.bbPeriod);
    if (closes.length < required) {
      return this.waitSignal(`Insufficient data: ${closes.length}/${required}`);
    }

    // Calculate all indicators
    const signals = this.calculateIndicators(closes, volumes);

    // Check volatility threshold
    if (signals.volatility < this.volatilityThreshold) {
      return this.waitSignal(`Volatility too low: ${(signals.volatility * 100).toFixed(2)}% < ${(this.volatilityThreshold * 100).toFixed(0)}%`, {
        volatility: signals.volatility,
      });
    }

    // Evaluate confluence
    const result = evaluateConfluence(signals);

    if (result.buyScore >= result.sellScore && result.buyScore > 0.5) {
      const confidence = calculateConfidence(result, signals, this.minConfluence);
      return this.buySignal(confidence, `Multi-indicator buy (${result.agreeing}/${4} confluence)`, {
        scores: result,
        indicators: signals,
      });
    }

    if (result.sellScore > result.buyScore && result.sellScore > 0.5) {
      const confidence = calculateConfidence(result, signals, this.minConfluence);
      return this.sellSignal(confidence, `Multi-indicator sell (${result.agreeing}/${4} confluence)`, {
        scores: result,
        indicators: signals,
      });
    }

    return this.waitSignal('No clear confluence', {
      buyScore: result.buyScore,
      sellScore: result.sellScore,
      agreeing: result.agreeing,
    });
  }

  /**
   * Calculate all indicators and return normalized scores
   */
  private calculateIndicators(closes: number[], volumes: number[]): IndicatorSignals {
    return computeIndicatorSignals(closes, volumes, {
      emaFast: this.emaFast,
      emaSlow: this.emaSlow,
      rsiPeriod: this.rsiPeriod,
      bbPeriod: this.bbPeriod,
      bbStdDev: this.bbStdDev,
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
      emaFast: calculateEma(closes, this.emaFast),
      emaSlow: calculateEma(closes, this.emaSlow),
      rsi: calculateRsi(closes, this.rsiPeriod),
    };
  }
}
