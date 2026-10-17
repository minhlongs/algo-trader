/**
 * Wave 229: Bouchaud, Farmer & Lillo (2009) Metaorder Square-Root Impact Types.
 * Strictly < 200 LOC, zero :any.
 */

export interface BouchaudImpactConfig {
  readonly universalY: number; // typically Y ~ 0.5 - 0.7
  readonly dailyVolumeV: number;
  readonly dailyVolatilitySigma: number;
  readonly relaxationExponentBeta?: number; // default beta ~ 0.5
}

export interface MetaorderParams {
  readonly metaorderSharesQ: number;
  readonly executionDurationSecT: number;
}

export interface MetaorderImpactAssessment {
  readonly peakImpact: number;
  readonly participationRatio: number;
  readonly permanentImpactEst: number;
  readonly instantaneousImpactAtEnd: number;
}
