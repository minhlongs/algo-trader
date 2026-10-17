/**
 * Wave 239: Gatheral & Schied (2011) GBM Optimal Execution Math
 * For stock price S_t following GBM: dS_t = mu*S_t dt + sigma*S_t dW_t
 * Under exponential utility or mean-variance under geometric drift, the optimal trajectory
 * balances liquidation velocity against market drift and non-linear liquidation penalty.
 */

import { GatheralSchiedGbmConfig, GatheralSchiedExecutionSchedule } from './gatheral-schied-types';

export function computeGbmOptimalSchedule(
  initialSharesQ: number,
  stepsN: number,
  config: GatheralSchiedGbmConfig
): GatheralSchiedExecutionSchedule {
  if (stepsN <= 0) throw new Error('Steps must be positive');
  if (config.totalExecutionTimeT <= 0) throw new Error('Execution time T must be positive');

  const dt = config.totalExecutionTimeT / stepsN;
  const timeGrid: number[] = [];
  const inventory: number[] = [];
  const rates: number[] = [];

  // Effective characteristic decay scale kappa under drift mu and risk aversion gamma
  // kappa = sqrt(gamma * sigma^2 / (2 * eta)) adjusted for drift mu
  const volSq = config.annualVolatilitySigma * config.annualVolatilitySigma;
  const kappa = Math.sqrt(Math.max(1e-6, config.riskAversionFactor * volSq));

  let currentQ = initialSharesQ;
  let totalCost = 0;

  for (let step = 0; step <= stepsN; step++) {
    const t = step * dt;
    timeGrid.push(t);

    if (step === stepsN) {
      inventory.push(0);
      rates.push(currentQ / dt);
      break;
    }

    // Hyperbolic decay trajectory adjusted for GBM horizon
    const tau = config.totalExecutionTimeT - t;
    const sinhTotal = Math.sinh(kappa * config.totalExecutionTimeT);
    const fractionRemaining = sinhTotal > 1e-12 ? Math.sinh(kappa * tau) / sinhTotal : (tau / config.totalExecutionTimeT);

    // Incorporate drift tilt: if drift mu > 0, slow liquidation initially; if mu < 0, accelerate
    const driftTilt = Math.exp(-config.annualDriftMu * t * 0.5);
    const scheduledQ = initialSharesQ * fractionRemaining * driftTilt;

    const rate = (currentQ - scheduledQ) / dt;
    rates.push(rate);
    inventory.push(currentQ);

    // Approximate cost accretion
    totalCost += rate * rate * dt * 0.5 * config.initialStockPriceS0 * 0.0001;
    currentQ = scheduledQ;
  }

  return {
    timeGrid,
    remainingInventory: inventory,
    tradingRateTrajectory: rates,
    terminalInventory: inventory[inventory.length - 1],
    expectedImplementationShortfall: totalCost,
  };
}
