/**
 * Almgren (2003) Mathematical Formulations.
 * Optimal liquidation with power-law temporary impact h(v) = eta * v^alpha.
 */

import { AlmgrenNonLinearConfig, AlmgrenNonLinearAssessment } from './almgren-nonlinear-types';

export function computePowerLawVelocity(
  config: AlmgrenNonLinearConfig,
  timeSec: number
): number {
  const { totalSharesX0, horizonSecT, powerExponentAlpha, riskAversionLambda, volatilitySigma, temporaryImpactEta } = config;
  const alpha = Math.min(0.99, Math.max(0.1, powerExponentAlpha));

  // Average velocity
  const vAvg = totalSharesX0 / horizonSecT;

  // Curvature coefficient driven by risk aversion
  const mu = (riskAversionLambda * Math.pow(volatilitySigma, 2)) / Math.max(1e-6, temporaryImpactEta);

  // Velocity profile decelerates over execution window
  const progress = Math.min(1, Math.max(0, timeSec / horizonSecT));
  const modulation = Math.max(0.01, 1 - (1 - alpha) * Math.sqrt(mu) * progress * 0.5);

  return vAvg * Math.pow(modulation, 1 / (1 - alpha));
}

export function evaluateAlmgrenNonLinearExecution(
  config: AlmgrenNonLinearConfig
): AlmgrenNonLinearAssessment {
  const v0 = computePowerLawVelocity(config, 0);
  const vT = computePowerLawVelocity(config, config.horizonSecT);

  const avgV = (v0 + vT) / 2;
  const tempImpact = config.temporaryImpactEta * Math.pow(avgV, config.powerExponentAlpha);
  const permCost = 0.5 * config.permanentImpactGamma * Math.pow(config.totalSharesX0, 2);
  const tempCost = tempImpact * config.totalSharesX0;

  return {
    initialTradingVelocity: v0,
    terminalTradingVelocity: vT,
    effectiveTemporaryImpact: tempImpact,
    expectedTotalCost: permCost + tempCost,
  };
}
