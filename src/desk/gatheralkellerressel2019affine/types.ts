/**
 * Wave 300 — Gatheral & Keller-Ressel (2019): Affine Forward Variance Models
 * Types & Configuration Interfaces
 */

export interface GatheralKellerRessel2019AffineConfig {
  readonly spotVarianceV0: number;
  readonly longRunVarianceTheta: number;
  readonly meanReversionLambda: number;
  readonly hurstExponentH: number;
  readonly volOfVolNu: number;
  readonly maturityT: number;
}

export interface GatheralKellerRessel2019AffineResult {
  readonly roughAlphaExponent: number;
  readonly forwardVarianceAtMaturity: number;
  readonly integratedForwardVariance: number;
  readonly affineVarianceSwapFairStrike: number;
  readonly isAffineAdmissible: boolean;
}
