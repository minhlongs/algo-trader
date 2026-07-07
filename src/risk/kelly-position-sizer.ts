/**
 * Kelly Criterion Position Sizer
 * Calculates optimal position size based on win rate and risk/reward.
 */

export interface KellyInput {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  bankroll: number;
  maxFraction?: number;
}

export interface KellyResult {
  kellyFraction: number;
  recommendedSize: number;
  cappedFraction: number;
}

export function calculateKelly(input: KellyInput): KellyResult {
  const { winRate, avgWin, avgLoss, bankroll, maxFraction = 0.25 } = input;

  if (avgLoss <= 0 || bankroll <= 0) {
    return { kellyFraction: 0, recommendedSize: 0, cappedFraction: 0 };
  }

  const b = avgWin / avgLoss;
  const p = winRate;
  const q = 1 - p;
  const kellyFraction = (b * p - q) / b;

  const cappedFraction = Math.max(0, Math.min(kellyFraction, maxFraction));
  const recommendedSize = bankroll * cappedFraction;

  return { kellyFraction, cappedFraction, recommendedSize };
}

export interface CalculatePositionSizeInput {
  winProbability: number;
  winLossRatio: number;
  portfolioValue: number;
  correlation: number;
  kellyFraction?: number;
  minPositionUsd?: number;
  maxPositionFraction?: number;
}

export interface PositionSizeResult {
  kellyFraction: number;
  recommendedSize: number;
  cappedFraction: number;
  correlationAdjustedSize: number;
  positionSizeUsd: number;
}

/**
 * KellyPositionSizer - class wrapper for correlation-adjusted position sizing.
 * Supports the backtest and trading pipeline that expect an OOP interface.
 */
export class KellyPositionSizer {
  private kellyFraction: number;
  private maxPositionFraction: number;
  private minPositionUsd: number;

  constructor(opts: {
    kellyFraction?: number;
    maxPositionFraction?: number;
    minPositionUsd?: number;
  } = {}) {
    this.kellyFraction = opts.kellyFraction ?? 0.25;
    this.maxPositionFraction = opts.maxPositionFraction ?? 0.05;
    this.minPositionUsd = opts.minPositionUsd ?? 1;
  }

  calculatePositionSize(input: CalculatePositionSizeInput): PositionSizeResult {
    const { winProbability, winLossRatio, portfolioValue, correlation } = input;

    const result = calculateKelly({
      winRate: winProbability,
      avgWin: winLossRatio,
      avgLoss: 1,
      bankroll: portfolioValue,
      maxFraction: this.kellyFraction,
    });

    const correlationFactor = 1 - correlation;
    const adjustedSize = result.recommendedSize * correlationFactor;
    const cap = portfolioValue * this.maxPositionFraction;
    const positionSizeUsd = Math.max(this.minPositionUsd, Math.min(adjustedSize, cap));

    return {
      kellyFraction: result.kellyFraction,
      recommendedSize: result.recommendedSize,
      cappedFraction: result.cappedFraction,
      correlationAdjustedSize: adjustedSize,
      positionSizeUsd,
    };
  }
}
