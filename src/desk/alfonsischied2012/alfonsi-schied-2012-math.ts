import { AlfonsiSchied2012Config, AlfonsiSchied2012Result, AlfonsiTrajectoryStep } from './types';

/**
 * Wave 259: Alfonsi, Schied & Slynko (2012) Resilient Non-Linear Order Book Impact Math.
 * Strictly < 80 LOC, zero :any.
 */
export function computeShapeImpact(x: number, gamma: number, lambda = 1.0): number {
  if (x === 0) return 0;
  return Math.sign(x) * lambda * Math.pow(Math.abs(x), gamma);
}

export function simulateResilienceDecay(
  initialDeviation: number,
  timeHorizon: number,
  steps: number,
  rho: number
): readonly number[] {
  const dt = timeHorizon / Math.max(1, steps);
  const decayFactor = Math.exp(-rho * dt);
  const deviations: number[] = [initialDeviation];
  let current = initialDeviation;
  for (let i = 1; i <= steps; i++) {
    current *= decayFactor;
    deviations.push(current);
  }
  return deviations;
}

export function computeAlfonsiSchiedTrajectory(
  config: AlfonsiSchied2012Config
): AlfonsiSchied2012Result {
  const { initialPrice, totalShares, executionHorizon, steps, resilienceRate, impactGamma } = config;
  const lambda = config.impactScaleLambda ?? 1.0;
  const n = Math.max(1, steps);
  const dt = executionHorizon / n;
  const decay = Math.exp(-resilienceRate * dt);
  const tradePerStep = totalShares / n;

  let currentDeviation = 0;
  let remainingShares = totalShares;
  let totalCost = 0;
  const trajectory: AlfonsiTrajectoryStep[] = [];

  for (let i = 0; i < n; i++) {
    const time = i * dt;
    const impact = computeShapeImpact(tradePerStep, impactGamma, lambda);
    currentDeviation = currentDeviation * decay + impact;
    const executionPrice = initialPrice + currentDeviation;
    totalCost += tradePerStep * currentDeviation;
    remainingShares -= tradePerStep;

    trajectory.push({
      step: i + 1,
      time: time + dt,
      tradeSize: tradePerStep,
      remainingShares: Math.max(0, remainingShares),
      priceDeviation: currentDeviation,
      executionPrice,
    });
  }

  const averageExecutionPrice = totalShares !== 0
    ? initialPrice + totalCost / totalShares
    : initialPrice;

  return {
    trajectory,
    totalExecutionCost: totalCost,
    averageExecutionPrice,
    terminalPriceDeviation: currentDeviation,
    decayFactor: decay,
  };
}
