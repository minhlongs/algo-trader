/**
 * Wave 219: Lehalle & Neuman (2019) Order Flow-Adjusted Execution Types.
 *
 * Implements Almgren-Chriss extension incorporating mean-reverting order flow imbalance.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export interface LehalleNeumanConfig {
  totalSharesToExecute: number;       // Q_0 (> 0 for buy, < 0 for sell)
  timeHorizonSec: number;             // T (seconds)
  riskAversionLambda: number;         // lambda (> 0)
  permanentImpactGamma: number;       // gamma
  temporaryImpactEta: number;         // eta
  volatilitySigma: number;            // sigma
  orderFlowMeanReversionKappa: number;// kappa (mean-reversion speed of imbalance)
  orderFlowImpactBeta: number;        // beta (price impact coupling to order flow)
}

export interface OrderFlowTrajectoryPoint {
  step: number;
  timeSec: number;
  optimalSpeedSharesPerSec: number;
  almgrenChrissBaselineSpeed: number;
  orderFlowAdjustmentSpeed: number;
  remainingShares: number;
  orderFlowImbalance: number;
}

export interface LehalleNeumanExecutionSchedule {
  config: LehalleNeumanConfig;
  initialImbalance: number;
  terminalRemainingShares: number;
  expectedExecutionCostUsd: number;
  trajectory: OrderFlowTrajectoryPoint[];
}
