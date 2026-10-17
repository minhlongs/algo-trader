/**
 * Wave 264: Almgren & Li (2016) Option Hedging with Market Impact Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface AlmgrenLiHedgingConfig {
  readonly targetDeltaTrajectory: readonly number[]; // Delta_t target share holdings
  readonly timeStep: number; // dt
  readonly tempImpactEta: number; // eta > 0
  readonly riskAversionLambda: number; // lambda > 0
  readonly assetVolatility: number; // sigma > 0
  readonly initialHolding?: number; // q_0
}

export interface HedgingTrajectoryStep {
  readonly step: number;
  readonly targetDelta: number;
  readonly holding: number; // q_t
  readonly trackingError: number; // q_t - Delta_t
  readonly tradingVelocity: number; // v_t
  readonly stepSlippageCost: number;
}

export interface AlmgrenLiHedgingResult {
  readonly trajectory: readonly HedgingTrajectoryStep[];
  readonly optimalLagTimescale: number; // tau_hedge
  readonly totalSlippageCost: number;
  readonly trackingVariance: number;
  readonly totalFrictionObjective: number;
}
