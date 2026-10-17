/**
 * Wave 271 — Cartea & Jaimungal (2015): Optimal Execution with Limit and Market Orders
 * Hybrid HJB solver combining passive limit order posting and aggressive market order sweeps.
 */
import type {
  Cartea2015LimitMarketConfig,
  Cartea2015LimitMarketResult,
  LimitMarketStep,
} from './types';

export function computeCartea2015LimitMarketExecution(
  cfg: Cartea2015LimitMarketConfig,
): Cartea2015LimitMarketResult {
  const {
    initialInventory: Q0,
    horizonSec: T,
    steps: N,
    limitFillIntensityLambda: lambda,
    limitFillDecayKappa: kappa,
    temporaryImpactEta: eta,
    riskAversionPhi: phi,
  } = cfg;

  if (Q0 <= 0 || T <= 0 || N <= 0 || lambda <= 0 || kappa <= 0 || eta <= 0 || phi < 0) {
    throw new Error('Invalid Cartea2015LimitMarketConfig: parameters outside valid positive domain');
  }

  const dt = T / N;
  const gamma = Math.sqrt(Math.max(1e-8, phi / eta));
  const trajectory: LimitMarketStep[] = [];
  let q = Q0;
  let totalLimitVolume = 0;
  let totalMarketVolume = 0;
  let spreadCaptured = 0;
  let impactCost = 0;

  for (let i = 0; i <= N; i++) {
    const t = Math.min(i * dt, T);
    const tau = Math.max(0, T - t);
    const marginalValue = gamma > 1e-4 && tau > 0
      ? 2 * eta * q * gamma * (Math.cosh(gamma * tau) / Math.max(1e-6, Math.sinh(gamma * tau)))
      : 2 * eta * (q / Math.max(dt, tau));

    const optimalDelta = Math.max(0, 1 / kappa - marginalValue * 0.15);
    const limitFillRate = i < N && q > 0 ? lambda * Math.exp(-kappa * optimalDelta) : 0;
    const targetTotalRate = i < N && tau > 0 ? q / tau : 0;
    const marketRate = i < N && q > 0
      ? Math.max(0, targetTotalRate - limitFillRate * 0.75)
      : 0;
    const combinedRate = Math.min(q / dt, limitFillRate + marketRate);

    trajectory.push({
      step: i,
      timeSec: t,
      inventory: q,
      optimalLimitSpread: optimalDelta,
      expectedLimitFillRate: limitFillRate,
      marketOrderRate: marketRate,
      totalLiquidationRate: combinedRate,
    });

    if (i < N && q > 0) {
      const stepLimitVol = Math.min(q, limitFillRate * dt);
      const stepMktVol = Math.min(Math.max(0, q - stepLimitVol), marketRate * dt);
      totalLimitVolume += stepLimitVol;
      totalMarketVolume += stepMktVol;
      spreadCaptured += stepLimitVol * optimalDelta;
      impactCost += eta * marketRate * marketRate * dt;
      q = Math.max(0, q - (stepLimitVol + stepMktVol));
    }
  }

  const executedTotal = Math.max(1e-9, totalLimitVolume + totalMarketVolume);
  return {
    trajectory,
    passiveLimitShareRatio: totalLimitVolume / executedTotal,
    totalSpreadCaptured: spreadCaptured,
    totalMarketImpactCost: impactCost,
    terminalInventory: q,
  };
}
