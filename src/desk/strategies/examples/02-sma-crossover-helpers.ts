/**
 * Pure SMA crossover indicator calculations and signal builders.
 */

import type { ISignal } from '../../interfaces/IStrategy';

export function calculateSmaSeries(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

export function calculateRecentMomentum(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1]!;
  const previous = closes[closes.length - period - 1]!;
  return (current - previous) / previous;
}

export function calculateCrossoverConfidence(
  primary: number,
  secondary: number,
  closes: number[],
): number {
  const diff = primary - secondary;
  const avgPrice = closes[closes.length - 1]!;
  const spreadPercent = Math.abs(diff / avgPrice);

  // Base confidence from spread (0.5 - 1.0)
  const baseConfidence = 0.5 + Math.min(spreadPercent * 100, 0.5);

  // Add momentum component
  const recentReturns = calculateRecentMomentum(closes, 5);
  const momentumBoost = recentReturns > 0 ? 0.2 : 0;

  return Math.min(baseConfidence + momentumBoost, 1.0);
}

export function createBuySignal(
  confidence: number,
  reason: string,
  metadata?: Record<string, unknown>,
): ISignal {
  return { action: 'buy', confidence, reason, metadata };
}

export function createSellSignal(
  confidence: number,
  reason: string,
  metadata?: Record<string, unknown>,
): ISignal {
  return { action: 'sell', confidence, reason, metadata };
}

export function createWaitSignal(
  reason: string,
  metadata?: Record<string, unknown>,
): ISignal {
  return { action: 'wait', confidence: 0, reason, metadata };
}
