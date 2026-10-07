/**
 * Cross Venue Correlation Matrix Types
 *
 * Contracts for multi-contract rolling covariance tracking,
 * Pearson correlation calibration, and portfolio diversification index.
 *
 * @module desk/signal/cross-venue-correlation-types
 */

export interface PriceObservationVector {
  readonly timestamp: number;
  readonly pricesBySymbol: Readonly<Record<string, number>>;
}

export interface CorrelationMatrixResult {
  readonly symbols: readonly string[];
  readonly matrix: readonly (readonly number[])[];
  readonly avgPairwiseCorrelation: number;
  readonly sampleCount: number;
}
