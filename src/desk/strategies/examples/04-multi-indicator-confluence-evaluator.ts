/**
 * Indicator & Confluence Evaluation for Multi-Indicator Confluence Strategy
 */

import type { IndicatorSignals, ConfluenceResult } from './04-multi-indicator-confluence-types';
import { calculateEma, calculateRsi, calculateSma, calculateStd } from './04-multi-indicator-confluence-math';

export function computeIndicatorSignals(
  closes: number[],
  volumes: number[],
  params: {
    emaFast: number;
    emaSlow: number;
    rsiPeriod: number;
    bbPeriod: number;
    bbStdDev: number;
  }
): IndicatorSignals {
  // 1. Trend: EMA crossover
  const ema12 = calculateEma(closes, params.emaFast);
  const ema26 = calculateEma(closes, params.emaSlow);
  const trend = ema12 > ema26 ? 1 : ema12 < ema26 ? -1 : 0;

  // 2. Momentum: RSI
  const rsi = calculateRsi(closes, params.rsiPeriod);
  let momentum = 0;
  if (rsi < 30) momentum = 1; // Oversold = bullish
  else if (rsi > 70) momentum = -1; // Overbought = bearish
  else momentum = 0.5; // Neutral zone

  // 3. Volatility: Bollinger Band width
  const bbMiddle = calculateSma(closes, params.bbPeriod);
  const bbUpper = bbMiddle + calculateStd(closes.slice(-params.bbPeriod), bbMiddle) * params.bbStdDev;
  const bbLower = bbMiddle - calculateStd(closes.slice(-params.bbPeriod), bbMiddle) * params.bbStdDev;
  const bbWidth = (bbUpper - bbLower) / bbMiddle; // Normalized width
  const volatility = Math.min(bbWidth * 5, 1); // Scale to 0-1

  // 4. Volume: Compare recent volume to average
  const volumeSma = calculateSma(volumes, 20);
  const recentVolume = volumes[volumes.length - 1]!;
  const volumeRatio = volumeSma > 0 ? recentVolume / volumeSma : 1;
  let volumeSignal = 0;
  if (volumeRatio > 1.5) volumeSignal = trend > 0 ? 1 : -1; // High volume confirming trend
  else volumeSignal = 0;

  return {
    trend,
    momentum,
    volatility,
    volume: volumeSignal,
  };
}

export function evaluateConfluence(signals: IndicatorSignals): ConfluenceResult {
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

export function calculateConfidence(
  result: ConfluenceResult,
  signals: IndicatorSignals,
  minConfluence: number
): number {
  const base = Math.max(result.buyScore, result.sellScore);
  const confluenceBonus = (result.agreeing - minConfluence) * 0.1;
  const volatilityFactor = 1 - signals.volatility * 0.2; // Lower confidence in high volatility

  return Math.min(Math.max(base + confluenceBonus, 0), 1) * volatilityFactor;
}
