/**
 * Wave 264: Almgren & Li (2016) Option Hedging with Market Impact.
 * Calculates optimal lag timescale tau_hedge and dynamic delta hedging trajectory.
 * Strictly < 85 LOC, zero :any.
 */

import { AlmgrenLiHedgingConfig, AlmgrenLiHedgingResult, HedgingTrajectoryStep } from './types';

export function computeAlmgrenLiHedging(cfg: AlmgrenLiHedgingConfig): AlmgrenLiHedgingResult {
  const { targetDeltaTrajectory: targets, timeStep: dt, tempImpactEta: eta, riskAversionLambda: lambda, assetVolatility: sigma } = cfg;

  if (targets.length === 0 || dt <= 0 || eta <= 0 || lambda <= 0 || sigma <= 0) {
    throw new Error('Invalid AlmgrenLiHedgingConfig parameters');
  }

  // Optimal hedging relaxation timescale tau_hedge = sqrt(eta / (lambda * sigma^2))
  const tauHedge = Math.sqrt(eta / (lambda * (sigma * sigma)));

  const trajectory: HedgingTrajectoryStep[] = [];
  let currentHolding = cfg.initialHolding ?? targets[0];
  let totalSlippage = 0;
  let sumSquaredTrackingError = 0;

  for (let k = 0; k < targets.length; k++) {
    const targetDelta = targets[k];
    const trackingError = currentHolding - targetDelta;
    sumSquaredTrackingError += trackingError * trackingError;

    // Trading velocity toward target delta: v_t = (Delta_t - q_t) / tau_hedge
    const velocity = (targetDelta - currentHolding) / Math.max(tauHedge, dt);

    // Quadratic temporary price impact cost step: eta * v_t^2 * dt
    const stepCost = eta * (velocity * velocity) * dt;
    totalSlippage += stepCost;

    trajectory.push({
      step: k,
      targetDelta,
      holding: currentHolding,
      trackingError,
      tradingVelocity: velocity,
      stepSlippageCost: stepCost,
    });

    // Advance holding for next step
    currentHolding += velocity * dt;
  }

  const trackingVariance = (sumSquaredTrackingError / targets.length) * (sigma * sigma);
  const totalObjective = totalSlippage + lambda * trackingVariance;

  return {
    trajectory,
    optimalLagTimescale: tauHedge,
    totalSlippageCost: totalSlippage,
    trackingVariance,
    totalFrictionObjective: totalObjective,
  };
}
