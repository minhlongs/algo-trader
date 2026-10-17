/**
 * Wave 208: Barndorff-Nielsen, Kinnebrock & Shephard (2010) Realized Semivariance & Signed Jumps.
 * Separates upside positive variation from downside negative tail risk.
 * Strictly < 180 LOC, zero :any.
 */

export interface SemivarianceConfig {
  annualizationFactor: number;
  sampleFrequencyMinutes?: number;
  significanceAlpha?: number;
}

export interface SemivarianceResult {
  sampleSize: number;
  realizedVariance: number;
  positiveSemivariance: number;
  negativeSemivariance: number;
  bipowerVariation: number;
  signedJumpVariation: number;
  upsideJumpVariation: number;
  downsideJumpVariation: number;
  asymmetryRatio: number;
  negativeToPositiveRatio: number;
  annualizedTotalVol: number;
  annualizedGoodVol: number;
  annualizedBadVol: number;
  volatilityRegime: 'GOOD_VOLATILITY' | 'BAD_VOLATILITY' | 'BALANCED';
  jumpDetected: boolean;
}
