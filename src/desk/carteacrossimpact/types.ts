/**
 * Wave 251: Cartea & Jaimungal (2014) Multi-Asset Cross-Impact Liquidation Types.
 *
 * Models joint liquidation of multiple correlated assets under permanent and temporary
 * cross-asset price impact matrices and covariance penalties.
 *
 * Strictly < 80 LOC, zero `:any` types.
 */

export interface AssetInventoryState {
  readonly assetId: string;
  readonly initialSharesQ: number;
  readonly currentSharesQ: number;
  readonly tradingSpeedNu: number;
}

export interface CrossImpactLiquidationConfig {
  readonly riskAversionPhi: number;
  readonly timeRemainingT: number;
  readonly temporaryCrossImpactMatrix: readonly (readonly number[])[];
  readonly assetCovarianceMatrix: readonly (readonly number[])[];
}

export interface CrossImpactOptimalTrajectory {
  readonly optimalExecutionSpeedsNu: readonly number[];
  readonly instantExecutionCost: number;
  readonly totalInventoryRiskPenalty: number;
  readonly crossAssetSpilloverFriction: number;
}
