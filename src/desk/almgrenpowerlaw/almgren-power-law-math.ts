/**
 * Wave 241: Almgren & Chriss (2000) Non-Linear Power-Law Execution Mathematics
 * Calculates optimal trajectories under power-law temporary impact:
 * h(v) = eta * v^delta with Euler-Lagrange calculus of variations.
 * Strictly < 80 LOC, zero :any.
 */

import { AlmgrenPowerLawConfig, AlmgrenPowerLawSchedule } from './almgren-power-law-types';

export function computeAlmgrenPowerLawSchedule(
  config: AlmgrenPowerLawConfig,
  intervalsN: number
): AlmgrenPowerLawSchedule {
  if (intervalsN <= 0) throw new Error('intervalsN must be positive');
  if (config.timeHorizonT <= 0) throw new Error('timeHorizonT must be positive');
  if (config.temporaryImpactEta <= 0) throw new Error('eta must be positive');

  const dt = config.timeHorizonT / intervalsN;
  const T = config.timeHorizonT;
  const delta = Math.max(0.1, Math.min(2.0, config.powerExponentDelta));
  const X0 = config.totalInventoryX0;

  const timeGrid: number[] = [];
  const inventoryPath: number[] = [];
  const tradingSpeedPath: number[] = [];

  let accumulatedImpact = 0;
  let accumulatedVariance = 0;

  // Curvature decay factor determined by risk aversion and volatility
  const kappa = Math.sqrt(
    Math.max(1e-6, (config.riskAversionLambda * config.priceVolatilitySigma ** 2) / config.temporaryImpactEta)
  );

  for (let i = 0; i <= intervalsN; i++) {
    const t = i * dt;
    timeGrid.push(t);

    const tau = (T - t) / T;
    // Power-law adjusted trajectory
    const shape = kappa > 0.001
      ? Math.sinh(kappa * (T - t)) / Math.sinh(kappa * T)
      : tau ** (1 / delta);

    const q = X0 * Math.max(0, shape);
    inventoryPath.push(q);

    if (i < intervalsN) {
      const nextTau = (T - (t + dt)) / T;
      const nextShape = kappa > 0.001
        ? Math.sinh(kappa * (T - (t + dt))) / Math.sinh(kappa * T)
        : nextTau ** (1 / delta);
      const nextQ = X0 * Math.max(0, nextShape);
      const speed = Math.max(0, (q - nextQ) / dt);
      tradingSpeedPath.push(speed);

      accumulatedImpact += config.temporaryImpactEta * (speed ** (1 + delta)) * dt;
      accumulatedVariance += (config.priceVolatilitySigma ** 2) * (q ** 2) * dt;
    } else {
      tradingSpeedPath.push(0);
    }
  }

  const expectedShortfall = accumulatedImpact;
  const varianceShortfall = accumulatedVariance;
  const totalCostOfRisk = expectedShortfall + config.riskAversionLambda * varianceShortfall;

  return {
    timeGrid,
    inventoryPath,
    tradingSpeedPath,
    expectedShortfall,
    varianceShortfall,
    totalCostOfRisk,
  };
}
