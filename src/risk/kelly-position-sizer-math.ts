/**
 * Kelly Criterion Position Sizer — Pure Math & Types
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
  /** Adjusted Kelly = rawKelly × appliedFraction */
  kellyAdjusted: number;
  /** True when rawKelly size exceeded maxPositionFraction cap */
  cappedByMax: boolean;
  /** The fraction actually applied (clamped kellyFraction) */
  fractionUsed: number;
  /** positionSizeUsd as % of portfolioValue */
  portfolioPercent: number;
}

export interface KellySizerConfig {
  /** Fraction of Kelly to use (default 0.25 = quarter-Kelly). Clamped to 0.1–0.5. */
  kellyFraction: number;
  /** Max fraction of portfolio per position (default 0.05 = 5%). */
  maxPositionFraction: number;
  /** Minimum position size in USD (don't open below this). */
  minPositionUsd: number;
  /** If true and capital is managed (not own-account), caps kellyFraction at 0.25. */
  isManagedCapital?: boolean;
}

const ZERO_POSITION_RESULT: PositionSizeResult = {
  kellyFraction: 0,
  recommendedSize: 0,
  cappedFraction: 0,
  correlationAdjustedSize: 0,
  positionSizeUsd: 0,
  kellyAdjusted: 0,
  cappedByMax: false,
  fractionUsed: 0,
  portfolioPercent: 0,
};

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

export function computeCorrelationAdjustedSize(
  input: CalculatePositionSizeInput,
  config: KellySizerConfig,
): PositionSizeResult {
  const { winProbability, winLossRatio, portfolioValue, correlation } = input;

  if (winProbability <= 0 || winProbability >= 1 || winLossRatio <= 0 || portfolioValue <= 0) {
    return { ...ZERO_POSITION_RESULT };
  }

  const result = calculateKelly({
    winRate: winProbability,
    avgWin: winLossRatio,
    avgLoss: 1,
    bankroll: portfolioValue,
    maxFraction: config.kellyFraction,
  });

  const correlationFactor = 1 - correlation;
  const adjustedSize = result.recommendedSize * correlationFactor;
  const cap = portfolioValue * config.maxPositionFraction;
  const rawSize = Math.max(0, adjustedSize);
  const cappedByMax = rawSize > cap;
  const sizeAfterCap = Math.min(rawSize, cap);
  const positionSizeUsd = Math.max(config.minPositionUsd, sizeAfterCap);
  const kellyAdjusted = result.kellyFraction * config.kellyFraction;

  return {
    kellyFraction: result.kellyFraction,
    recommendedSize: result.recommendedSize,
    cappedFraction: result.cappedFraction,
    correlationAdjustedSize: adjustedSize,
    positionSizeUsd,
    kellyAdjusted,
    cappedByMax,
    fractionUsed: result.cappedFraction,
    portfolioPercent: (positionSizeUsd / portfolioValue) * 100,
  };
}
