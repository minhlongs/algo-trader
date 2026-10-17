/**
 * Wave 206: Christensen, Oomen & Podolskij (2014) Realized Quantile Variance Types.
 * Threshold-free jump detection and continuous diffusion separation.
 * Strictly < 180 LOC, zero :any.
 */

export interface RqvConfig {
  quantileAlpha: number; // e.g. 0.85 or 0.90
  blockLengthK: number;  // rolling sub-sample block length k, e.g. 5
  annualizationDays: number;
  significanceLevel: number; // e.g. 0.05 or 0.01 for jump test
}

export interface RqvResult {
  realizedVarianceTotal: number;
  realizedQuantileVarianceContinuous: number;
  jumpVariance: number;
  jumpFractionPct: number;
  jumpTestStatisticZ: number;
  hasSignificantJump: boolean;
  continuousVolatilityAnnualized: number;
  totalVolatilityAnnualized: number;
  sampleSize: number;
  blockCount: number;
  asymptoticQuantileSpreadConstant: number;
}
