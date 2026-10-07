/**
 * VPIN Toxic Flow Classifier Types
 *
 * Contracts for Volume-Synchronized Probability of Toxicity (VPIN) and
 * Shannon order flow entropy calculation for adverse selection protection.
 *
 * @module desk/risk/vpin-toxic-flow-types
 */

export type ToxicityRegime = 'BENIGN' | 'ELEVATED' | 'TOXIC_INFORMED';

export interface ExecutedTradeTick {
  readonly tradeId: string;
  readonly price: number;
  readonly volume: number;
  readonly timestampMs: number;
  readonly arrivalMidPrice: number;
}

export interface VpinClassifierConfig {
  readonly bucketVolumeSize: number;
  readonly totalBucketsN: number;
  readonly toxicThreshold: number;
  readonly elevatedThreshold: number;
}

export interface VpinToxicityMetrics {
  readonly marketId: string;
  readonly currentVpin: number;
  readonly orderEntropy: number;
  readonly toxicityRegime: ToxicityRegime;
  readonly recommendedSpreadMultiplier: number;
  readonly isAdverseSelectionImminent: boolean;
  readonly timestampMs: number;
}
