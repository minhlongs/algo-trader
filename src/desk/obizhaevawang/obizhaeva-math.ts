/**
 * Obizhaeva & Wang (2013) Optimal Trading with Transient Market Impact.
 * Delta X_0 = Delta X_T = X_0 / (rho * T + 2)
 * v(t) = (rho * X_0) / (rho * T + 2)
 * C* = (lambda * X_0^2) / (2 * (rho * T + 2))
 */
import { ObizhaevaTransientConfig, ObizhaevaExecutionRequest, ObizhaevaOptimalSchedule } from './obizhaeva-types';

export function calculateObizhaevaSchedule(
  req: ObizhaevaExecutionRequest,
  config: ObizhaevaTransientConfig
): ObizhaevaOptimalSchedule {
  const { totalSharesX0, timeHorizonSecT } = req;
  const { instantaneousImpactLambda, resilienceRateRho } = config;

  const denom = resilienceRateRho * timeHorizonSecT + 2;
  const blockJump = totalSharesX0 / denom;
  const continuousRate = (resilienceRateRho * totalSharesX0) / denom;
  const totalContinuous = continuousRate * timeHorizonSecT;
  const minCost = (instantaneousImpactLambda * Math.pow(totalSharesX0, 2)) / (2 * denom);

  return {
    initialBlockJumpDeltaX0: blockJump,
    terminalBlockJumpDeltaXT: blockJump,
    continuousTradingRateV: continuousRate,
    totalContinuousShares: totalContinuous,
    minimumExpectedCost: minCost,
  };
}
