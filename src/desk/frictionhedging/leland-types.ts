export enum ReplicatingPosition {
  SHORT_OPTION = 'SHORT', // Replicating a short option position (requires buying delta, amplifying vol)
  LONG_OPTION = 'LONG',   // Replicating a long option position (reducing vol)
}

export interface LelandParams {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly riskFreeRate: number;
  readonly dividendYield: number;
  readonly trueVolatility: number;
  readonly timeToMaturity: number; // Years
  readonly transactionCost: number; // Proportional cost k (e.g., 0.01 for 1%)
  readonly rebalanceInterval: number; // Delta t in years (e.g., 1/252 for daily)
  readonly position: ReplicatingPosition;
  readonly isCall: boolean;
}

export interface LelandResult {
  readonly modifiedVolatility: number;
  readonly modifiedVariance: number;
  readonly optionPrice: number;
  readonly frictionlessPrice: number;
  readonly replicationPremium: number;
}
