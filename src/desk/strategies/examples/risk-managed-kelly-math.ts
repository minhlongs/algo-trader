/**
 * Risk-Managed Kelly Strategy — Math & Statistical Calculations
 */

import type { ICandle } from '../../interfaces/IStrategy';
import type { KellyResult } from './risk-managed-kelly-types';

/**
 * Calculate Simple Moving Average
 */
export function calculateSma(data: number[], period: number): number {
  const recent = data.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate Average True Range over a period
 */
export function calculateAtr(candles: ICandle[], period: number): number {
  const atrValues: number[] = [];
  for (let i = 1; i < Math.min(candles.length, period + 1); i++) {
    const current = candles[i]!;
    const previous = candles[i - 1]!;
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close),
    );
    atrValues.push(tr);
  }
  return atrValues.reduce((a, b) => a + b, 0) / atrValues.length;
}

/**
 * Calculate recent price volatility (coefficient of variation)
 */
export function calculateRecentVolatility(candles: ICandle[], period: number): number {
  const closes = candles.slice(-period).map((c) => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const squaredDiffs = closes.map((c) => Math.pow(c - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / closes.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Calculate Kelly Criterion position size
 */
export function calculateKellyPosition(
  currentPrice: number,
  currentBalance: number,
  winRate: number,
  winLossRatio: number,
  maxPositionPercent: number,
  kellyFraction: number,
  candles: ICandle[],
): KellyResult {
  const p = winRate;
  const b = winLossRatio;
  const q = 1 - p;

  const kellyFrac = p > 0 && b > 0 ? (p * b - q) / b : 0;
  const fractionalKelly = Math.max(0, kellyFrac * kellyFraction);

  const volatility = calculateRecentVolatility(candles, 20);
  const volatilityAdjustment = Math.max(0.5, 1 - volatility * 10);

  const positionPercent = fractionalKelly * maxPositionPercent * volatilityAdjustment;
  const positionSizeUsd = currentBalance * positionPercent;
  const positionSize = positionSizeUsd / currentPrice;

  const atr = calculateAtr(candles, 14);
  const stopDistance = atr * 2;
  const stopPercent = stopDistance / currentPrice;

  return {
    size: positionSize,
    confidence: winRate * (1 - volatility),
    stopPercent: Math.min(stopPercent, 0.05),
  };
}
