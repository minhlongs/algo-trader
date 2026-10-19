import { AlmgrenPowerLawV2Config, AlmgrenPowerLawV2Result } from './types';

/**
 * Wave 253: Almgren (2003) Non-Linear Power-Law Optimal Execution.
 * Strictly < 80 LOC, zero :any.
 */
export function computeAlmgrenPowerLawTrajectory(
  config: AlmgrenPowerLawV2Config
): AlmgrenPowerLawV2Result {
  const n = Math.max(2, config.steps ?? 10);
  const dt = config.timeHorizonT / n;
  const x = new Array<number>(n + 1);
  const t = new Array<number>(n + 1);

  for (let k = 0; k <= n; k++) {
    t[k] = k * dt;
    x[k] = config.totalSharesX0 * (1 - k / n);
  }

  const { eta, powerAlpha, riskLambda, sigma } = config;
  const p = 1 + powerAlpha;
  const lr = (dt * dt) / (Math.max(1e-6, eta) * (1 + riskLambda));

  // Iterative gradient steps over Euler-Lagrange interior coordinates
  for (let iter = 0; iter < 100; iter++) {
    for (let k = 1; k < n; k++) {
      const vk = Math.max(0, (x[k - 1] - x[k]) / dt);
      const vkNext = Math.max(0, (x[k] - x[k + 1]) / dt);
      const gradImpact = -p * eta * Math.pow(vk, powerAlpha) + p * eta * Math.pow(vkNext, powerAlpha);
      const gradRisk = 2 * riskLambda * (sigma * sigma) * x[k] * dt;
      const grad = gradImpact + gradRisk;
      const xNew = x[k] - lr * grad;
      x[k] = Math.max(x[k + 1], Math.min(x[k - 1], xNew));
    }
  }

  const speeds = new Array<number>(n);
  let expectedShortfall = 0;
  let varianceShortfall = 0;

  for (let k = 1; k <= n; k++) {
    const v = Math.max(0, (x[k - 1] - x[k]) / dt);
    speeds[k - 1] = v;
    expectedShortfall += eta * Math.pow(v, p) * dt;
    varianceShortfall += sigma * sigma * (x[k] * x[k]) * dt;
  }

  const totalExecutionCost = expectedShortfall + riskLambda * varianceShortfall;

  return {
    timeGrid: t,
    inventoryTrajectory: x,
    tradingSpeeds: speeds,
    expectedShortfall,
    varianceShortfall,
    totalExecutionCost,
  };
}
