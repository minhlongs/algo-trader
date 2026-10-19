/**
 * Wave 277 — Gatheral & Schied (2013): Dynamical Models of Market Impact and Predatory Trading
 * Computes transient resilience equilibrium under predatory front-running and distressed liquidation.
 */
import type {
  GatheralSchied2013PredatoryConfig,
  GatheralSchied2013PredatoryResult,
  PredatoryStep,
} from './types';

export function computeGatheralSchied2013Predatory(
  cfg: GatheralSchied2013PredatoryConfig,
): GatheralSchied2013PredatoryResult {
  const {
    distressedInventoryQ0: Q0,
    horizonSec: T,
    steps: N,
    resilienceRateRho: rho,
    temporaryImpactEta: eta,
    permanentImpactGamma: gamma,
    predatorParticipationAlpha: alpha,
  } = cfg;

  if (Q0 <= 0 || T <= 0 || N <= 0 || rho <= 0 || eta <= 0 || gamma < 0 || alpha < 0 || alpha >= 1) {
    throw new Error('Invalid GatheralSchied2013PredatoryConfig: parameters outside valid domain');
  }

  const dt = T / N;
  const baseRate = Q0 / T;
  const trajectory: PredatoryStep[] = [];
  let qDistressed = Q0;
  let qPredator = 0;
  let transientDisp = 0;
  let distressedCost = 0;
  let predatorProfit = 0;

  for (let i = 0; i <= N; i++) {
    const t = Math.min(i * dt, T);
    const progress = t / T;
    const predatorRate = i < N ? alpha * baseRate * (1 - 2 * progress) : 0;
    const distressedRate = i < N ? baseRate : 0;

    trajectory.push({
      step: i,
      timeSec: t,
      distressedInventory: qDistressed,
      predatorInventory: qPredator,
      transientPriceDisplacement: transientDisp,
      distressedTradingRate: distressedRate,
      predatorTradingRate: predatorRate,
    });

    if (i < N) {
      const combinedFlow = distressedRate + Math.max(0, predatorRate);
      const stepImpact = eta * combinedFlow + transientDisp;
      const cumSold = (Q0 - qDistressed) + 0.5 * distressedRate * dt + Math.max(0, qPredator);
      distressedCost += distressedRate * (stepImpact + gamma * cumSold) * dt;
      predatorProfit += (-predatorRate * stepImpact + alpha * gamma * distressedRate * qDistressed) * dt;
      transientDisp = transientDisp * Math.exp(-rho * dt) + eta * combinedFlow * (1 - Math.exp(-rho * dt));
      qDistressed = Math.max(0, qDistressed - distressedRate * dt);
      qPredator += predatorRate * dt;
    }
  }

  const baselineCost = eta * baseRate * baseRate * T + 0.5 * gamma * Q0 * Q0;
  return {
    trajectory,
    distressedExecutionCost: distressedCost,
    baselineUnpredatedCost: baselineCost,
    predatoryCostInflationRatio: distressedCost / Math.max(1e-9, baselineCost),
    predatorExpectedProfit: Math.max(0, predatorProfit),
  };
}
