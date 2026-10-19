/**
 * Wave 267: Gatheral & Schied (2013) Fractional Brownian Motion & Rough Path Optimal Liquidation Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface RoughLiquidationConfig {
  readonly initialShares: number; // Q_0
  readonly executionHorizon: number; // T
  readonly steps: number; // N
  readonly hurstParameter: number; // H in (0, 0.5) for rough volatility regime
  readonly impactDecayKernelAlpha: number; // alpha = H - 1/2
  readonly tempImpactEta: number; // eta > 0
  readonly riskAversionLambda: number; // lambda > 0
}

export interface RoughTrajectoryStep {
  readonly step: number;
  readonly time: number;
  readonly inventory: number; // q_t
  readonly tradingVelocity: number; // v_t
  readonly kernelWeight: number; // K(t)
  readonly stepImpactCost: number;
}

export interface RoughLiquidationResult {
  readonly trajectory: readonly RoughTrajectoryStep[];
  readonly effectiveHurst: number;
  readonly memoryKernelExponent: number;
  readonly totalExecutionCost: number;
  readonly terminalInventory: number;
}
