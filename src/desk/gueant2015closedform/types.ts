/**
 * Wave 262: Guéant (2015) Closed-Form Approximations in Optimal Liquidation Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface Gueant2015Config {
  readonly initialShares: number; // Q_0
  readonly executionHorizon: number; // T (seconds or days)
  readonly steps: number; // N
  readonly impactAlpha: number; // alpha > 0, power-law exponent (e.g. 1.0 or 0.5)
  readonly impactEta: number; // eta > 0, temporary impact scale parameter
  readonly riskAversion: number; // gamma >= 0
  readonly volatility: number; // sigma > 0
}

export interface GueantTrajectoryStep {
  readonly step: number;
  readonly time: number;
  readonly inventory: number; // q(t)
  readonly tradingRate: number; // v(t) = -dq/dt
  readonly cumulativeSlippage: number;
}

export interface Gueant2015Result {
  readonly trajectory: readonly GueantTrajectoryStep[];
  readonly totalSlippageCost: number;
  readonly terminalInventory: number;
  readonly powerExponent: number; // (1 + alpha) / alpha
  readonly riskAdjustmentMagnitude: number;
}
