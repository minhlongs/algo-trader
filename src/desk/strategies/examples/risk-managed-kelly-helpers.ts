/**
 * Risk-Managed Kelly Strategy — Calculation Helpers
 *
 * Stateless utility functions extracted from RiskManagedKellyStrategy
 * for position sizing, risk checks, trailing stops, and win-rate tracking.
 * All functions are pure — they take inputs and return results without side effects.
 */

import type { ICandle } from '../../interfaces/IStrategy';
import { logger } from '../../../shared/utils/logger';

export interface Position {
  entryPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  side: 'long' | 'short';
  timestamp: number;
}

export interface RiskMetrics {
  dailyPnL: number;
  peakBalance: number;
  currentBalance: number;
  openPosition: Position | null;
}

export interface KellyResult {
  size: number;
  confidence: number;
  stopPercent: number;
}

export interface RiskCheck {
  pass: boolean;
  reason?: string;
}

export interface TrailingStopResult {
  triggered: boolean;
  metadata?: Record<string, any>;
}

export interface WinStats {
  winRate: number;
  winLossRatio: number;
}

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
      Math.abs(current.low - previous.close)
    );
    atrValues.push(tr);
  }
  return atrValues.reduce((a, b) => a + b, 0) / atrValues.length;
}

/**
 * Calculate recent price volatility (coefficient of variation)
 */
export function calculateRecentVolatility(candles: ICandle[], period: number): number {
  const closes = candles.slice(-period).map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const squaredDiffs = closes.map(c => Math.pow(c - mean, 2));
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

/**
 * Check all risk limits (daily loss + drawdown)
 */
export function checkRiskLimits(
  metrics: RiskMetrics,
  dailyLossLimitUsd: number,
  maxDrawdownPercent: number,
): RiskCheck {
  if (Math.abs(metrics.dailyPnL) > dailyLossLimitUsd && metrics.dailyPnL < 0) {
    return { pass: false, reason: `Daily loss limit hit: ${metrics.dailyPnL.toFixed(2)}` };
  }

  const drawdown = calculateDrawdown(metrics.peakBalance, metrics.currentBalance);
  if (drawdown > maxDrawdownPercent) {
    return { pass: false, reason: `Max drawdown hit: ${(drawdown * 100).toFixed(2)}%` };
  }

  return { pass: true };
}

/**
 * Calculate current drawdown from peak
 */
export function calculateDrawdown(peakBalance: number, currentBalance: number): number {
  return (peakBalance - currentBalance) / peakBalance;
}

/**
 * Check if trailing stop should trigger
 */
export function checkTrailingStop(
  position: Position,
  currentPrice: number,
  trailingStopPercent: number,
): TrailingStopResult {
  let stopPrice: number;

  if (position.side === 'long') {
    const trailPrice = currentPrice * (1 - trailingStopPercent);
    stopPrice = Math.max(position.stopLoss, trailPrice);
    if (currentPrice <= stopPrice) {
      return { triggered: true, metadata: { stopPrice, pnl: currentPrice - position.entryPrice } };
    }
  } else {
    const trailPrice = currentPrice * (1 + trailingStopPercent);
    stopPrice = Math.min(position.stopLoss, trailPrice);
    if (currentPrice >= stopPrice) {
      return { triggered: true, metadata: { stopPrice, pnl: position.entryPrice - currentPrice } };
    }
  }

  return { triggered: false };
}

/**
 * Compute position close result — returns updated metrics (does NOT mutate)
 */
export function closePositionResult(
  position: Position,
  exitPrice: number,
  metrics: RiskMetrics,
  recentTrades: Array<{ pnl: number; timestamp: number }>,
): {
  updatedMetrics: RiskMetrics;
  updatedTrades: Array<{ pnl: number; timestamp: number }>;
  pnl: number;
} {
  let pnl = 0;
  if (position.side === 'long') {
    pnl = (exitPrice - position.entryPrice) * position.size;
  } else {
    pnl = (position.entryPrice - exitPrice) * position.size;
  }

  const now = Date.now();
  const updatedMetrics: RiskMetrics = {
    dailyPnL: metrics.dailyPnL + pnl,
    currentBalance: metrics.currentBalance + pnl,
    peakBalance: Math.max(metrics.peakBalance, metrics.currentBalance + pnl),
    openPosition: null,
  };

  const updatedTrades = [
    ...recentTrades,
    { pnl, timestamp: now },
  ].filter(t => now - t.timestamp < 24 * 60 * 60 * 1000);

  return { updatedMetrics, updatedTrades, pnl };
}

/**
 * Update win rate and win/loss ratio from recent trades
 */
export function updateWinStats(recentTrades: Array<{ pnl: number; timestamp: number }>): WinStats {
  if (recentTrades.length < 5) return { winRate: 0.6, winLossRatio: 1.5 };

  const wins = recentTrades.filter(t => t.pnl > 0);
  const losses = recentTrades.filter(t => t.pnl <= 0);

  const winRate = wins.length / recentTrades.length;

  let winLossRatio = 1.5;
  if (losses.length > 0) {
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + Math.abs(b.pnl), 0) / wins.length : 0;
    const avgLoss = losses.reduce((a, b) => a + Math.abs(b.pnl), 0) / losses.length;
    winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1.5;
  }

  return { winRate, winLossRatio };
}
