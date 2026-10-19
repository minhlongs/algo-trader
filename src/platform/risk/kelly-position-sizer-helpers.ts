/**
 * Pure Kelly Criterion sizing and constraint validation helpers.
 */

import type { KellySizingRequest, KellySizingResponse } from './types';

export function clampKellyFraction(kellyFraction: number): number {
  return Math.max(0.1, Math.min(0.5, kellyFraction));
}

export function buildZeroKellyResponse(
  kellyFraction: number,
  correlation: number,
): KellySizingResponse {
  return {
    success: true,
    data: {
      positionSizeUsd: 0,
      kellyRaw: 0,
      kellyAdjusted: 0,
      cappedByMax: false,
      cappedByManaged: false,
      fractionUsed: kellyFraction,
      portfolioPercent: 0,
      correlation,
    },
    computedMs: 0,
  };
}

export function deriveTradeStats(tradeReturns: number[]): {
  winProbability: number;
  winLossRatio: number;
} {
  const wins = tradeReturns.filter((r) => r > 0);
  const losses = tradeReturns.filter((r) => r <= 0);
  const winProbability = wins.length / tradeReturns.length;

  const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLoss =
    losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r, 0) / losses.length) : 1;

  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
  return { winProbability, winLossRatio };
}

export function validateKellyInputs(input: KellySizingRequest): string[] {
  const warnings: string[] = [];

  if (input.winProbability <= 0 || input.winProbability >= 1) {
    warnings.push('Win probability must be between 0 and 1 (exclusive)');
  }
  if (input.winLossRatio <= 0) {
    warnings.push('Win/loss ratio must be positive — check historical trade data');
  }
  if (input.portfolioValue <= 0) {
    warnings.push('Portfolio value must be positive');
  }
  if ((input.correlation ?? 0) < -1 || (input.correlation ?? 0) > 1) {
    warnings.push('Correlation must be between -1 and 1');
  }
  if (input.kellyFraction !== undefined && (input.kellyFraction <= 0 || input.kellyFraction > 0.5)) {
    warnings.push('Kelly fraction should be between 0.1 and 0.5');
  }

  return warnings;
}
