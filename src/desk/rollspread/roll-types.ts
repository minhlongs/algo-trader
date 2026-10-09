export interface RollTradePoint {
  timestamp?: number;
  price: number;
  volume?: number;
}

export interface RollSpreadConfig {
  minTrades?: number; // Minimum number of trades required (default 5)
  handlePositiveCovariance?: 'zero' | 'magnitude' | 'warning';
}

export interface RollSpreadResult {
  sampleSize: number;
  firstOrderCovariance: number;
  effectiveSpread: number;
  percentageSpread: number; // Spread as a fraction of mean trade price
  priceVariance: number;
  bounceVarianceShare: number; // Fraction of price variance explained by bid-ask bounce
  isCovarianceNegative: boolean;
}
