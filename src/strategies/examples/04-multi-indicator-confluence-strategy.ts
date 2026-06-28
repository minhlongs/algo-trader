/**
 * Example 4: Multi-Indicator Confluence Strategy
 *
 * This strategy demonstrates:
 * - Combining multiple technical indicators
 * - Signal weighting and voting system
 * - Risk-adjusted position sizing
 * - Correlation and confirmation requirements
 *
 * INDICATORS USED:
 * 1. Trend: EMA (12) vs EMA (26) - determines trend direction
 * 2. Momentum: RSI (14) - identifies overbought/oversold
 * 3. Volatility: Bollinger Band width - measures market volatility
 * 4. Volume: Volume SMA ratio - confirms strength
 *
 * SIGNAL LOGIC:
 * - Requires at least 3/4 indicators to agree (75% confluence)
 * - Each indicator contributes confidence weight
 * - Signal strength varies with volatility and trend strength
 *
 * PARAMETERS:
 * - emaFast: Fast EMA period (default: 12)
 * - emaSlow: Slow EMA period (default: 26)
 * - rsiPeriod: RSI period (default: 14)
 * - minConfluence: Minimum agreeing indicators (default: 3)
 * - volatilityThreshold: Minimum BB width to trade (default: 0.02)
 *
 * WHY CONFLUENCE:
 * - Single indicators produce many false signals
 * - Multiple independent signals increase win rate
 * - Reduces trading in choppy/sideways markets
 *
 * RISK MANAGEMENT:
 * - Lower position size in high volatility
 * - Only trade when volatility exceeds threshold (avoid complacency)
 * - Confirmation requirement filters weak signals
 *
 * NEXT STEPS:
 * - Add support/resistance levels
 * - Incorporate market regime detection
 * - Implement time-based exit (max hold period)
 */

import type { IStrategy, ICandle, ISignal } from '../../interfaces/IStrategy.js';
import { logger } from '../../utils/logger.js';

const STRATEGY_NAME = 'MultiIndicatorConfluence';

interface IndicatorSignals {
  trend: number; // -1 (bearish), 0 (neutral), +1 (bullish)
  momentum: number; // 0-1 confidence
  volatility: number; // 0-1 (0=low, 1=high)
  volume: number; // -1 to +1
}

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

  constructor(opts?: {
    emaFast?: number;
    emaSlow?: number;
    rsiPeriod?: number;
    minConfluence?: number;
    volatilityThreshold?: number;
  }) {
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
    const result = this.evaluateConfluence(signals);

    if (result.buyScore >= result.sellScore && result.buyScore > 0.5) {
      const confidence = this.calculateConfidence(result, signals);
      return this.buySignal(confidence, `Multi-indicator buy (${result.agreeing}/${4} confluence)`, {
        scores: result,
        indicators: signals,
      });
    }

    if (result.sellScore > result.buyScore && result.sellScore > 0.5) {
      const confidence = this.calculateConfidence(result, signals);
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
    // 1. Trend: EMA crossover
    const ema12 = this.calculateEma(closes, this.emaFast);
    const ema26 = this.calculateEma(closes, this.emaSlow);
    const trend = ema12 > ema26 ? 1 : ema12 < ema26 ? -1 : 0;

    // 2. Momentum: RSI
    const rsi = this.calculateRsi(closes);
    let momentum = 0;
    if (rsi < 30) momentum = 1; // Oversold = bullish
    else if (rsi > 70) momentum = -1; // Overbought = bearish
    else momentum = 0.5; // Neutral zone

    // 3. Volatility: Bollinger Band width
    const bbMiddle = this.calculateSma(closes, this.bbPeriod);
    const bbUpper = bbMiddle + this.calculateStd(closes.slice(-this.bbPeriod), bbMiddle) * this.bbStdDev;
    const bbLower = bbMiddle - this.calculateStd(closes.slice(-this.bbPeriod), bbMiddle) * this.bbStdDev;
    const bbWidth = (bbUpper - bbLower) / bbMiddle; // Normalized width
    const volatility = Math.min(bbWidth * 5, 1); // Scale to 0-1

    // 4. Volume: Compare recent volume to average
    const volumeSma = this.calculateSma(volumes, 20);
    const recentVolume = volumes[volumes.length - 1]!;
    const volumeRatio = volumeSma > 0 ? recentVolume / volumeSma : 1;
    let volumeSignal = 0;
    if (volumeRatio > 1.5) volumeSignal = trend > 0 ? 1 : -1; // High volume confirming trend
    else volumeSignal = 0;

    return {
      trend: trend,
      momentum: momentum,
      volatility: volatility,
      volume: volumeSignal,
    };
  }

  /**
   * Evaluate confluence of all indicators
   */
  private evaluateConfluence(signals: IndicatorSignals): { buyScore: number; sellScore: number; agreeing: number } {
    let buyVotes = 0;
    let sellVotes = 0;

    // Trend vote
    if (signals.trend === 1) buyVotes++;
    else if (signals.trend === -1) sellVotes++;

    // Momentum vote
    if (signals.momentum === 1) buyVotes++;
    else if (signals.momentum === -1) sellVotes++;

    // Volume vote
    if (signals.volume === 1) buyVotes++;
    else if (signals.volume === -1) sellVotes++;

    // Buy score: majority of votes * average confidence
    const buyScore = (buyVotes / 4) * ((signals.trend + 1) / 2 + signals.momentum + (signals.volume + 1) / 2) / 3;
    const sellScore = (sellVotes / 4) * ((-signals.trend + 1) / 2 + (1 - signals.momentum) + (-signals.volume + 1) / 2) / 3;

    return {
      buyScore: Math.max(0, buyScore),
      sellScore: Math.max(0, sellScore),
      agreeing: Math.max(buyVotes, sellVotes),
    };
  }

  /**
   * Calculate overall confidence based on confluence and volatility
   */
  private calculateConfidence(result: { buyScore: number; sellScore: number; agreeing: number }, signals: IndicatorSignals): number {
    const base = Math.max(result.buyScore, result.sellScore);
    const confluenceBonus = (result.agreeing - this.minConfluence) * 0.1;
    const volatilityFactor = 1 - signals.volatility * 0.2; // Lower confidence in high volatility

    return Math.min(Math.max(base + confluenceBonus, 0), 1) * volatilityFactor;
  }

  // Technical indicator helpers
  private calculateEma(data: number[], period: number): number {
    const multiplier = 2 / (period + 1);
    let ema = data[0]!;
    for (let i = 1; i < data.length; i++) {
      ema = data[i]! * multiplier + ema * (1 - multiplier);
    }
    return ema;
  }

  private calculateRsi(closes: number[]): number {
    const period = this.rsiPeriod;
    const recent = closes.slice(-period - 1);
    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i < recent.length; i++) {
      const change = recent[i] - recent[i - 1]!;
      if (change > 0) {
        avgGain += change;
      } else {
        avgLoss += Math.abs(change);
      }
    }

    avgGain /= period;
    avgLoss /= period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private calculateSma(data: number[], period: number): number {
    const recent = data.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / period;
  }

  private calculateStd(data: number[], mean: number): number {
    const squaredDiffs = data.map(x => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(variance);
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
      emaFast: this.calculateEma(closes, this.emaFast),
      emaSlow: this.calculateEma(closes, this.emaSlow),
      rsi: this.calculateRsi(closes),
    };
  }
}
