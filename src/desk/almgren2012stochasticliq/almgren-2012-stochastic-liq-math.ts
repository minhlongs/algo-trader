/**
 * Wave 280 — Almgren (2012): Optimal Trading with Stochastic Liquidity and Volatility
 * Modulates execution speed inversely with mean-reverting temporary impact eta_t.
 */
import type {
  Almgren2012StochasticLiqConfig,
  Almgren2012StochasticLiqResult,
  StochasticLiqStep,
} from './types';

export function computeAlmgren2012StochasticLiquidity(
  cfg: Almgren2012StochasticLiqConfig,
): Almgren2012StochasticLiqResult {
  const {
    initialInventoryQ0: Q0,
    horizonSec: T,
    steps: N,
    meanTemporaryImpactEtaBar: etaBar,
    liquidityReversionKappa: kappaEta,
    riskAversionLambda: lambda,
    volatilitySigma: sigma,
    realizedEtaPath: etaPath,
  } = cfg;

  if (Q0 <= 0 || T <= 0 || N <= 0 || etaBar <= 0 || kappaEta <= 0 || lambda < 0 || sigma <= 0 || etaPath.length < N + 1) {
    throw new Error('Invalid Almgren2012StochasticLiqConfig: invalid parameters or short etaPath');
  }

  const dt = T / N;
  const trajectory: StochasticLiqStep[] = [];
  let q = Q0;
  let qStatic = Q0;
  let totalCost = 0;
  let staticCost = 0;
  const staticRate = Q0 / T;

  for (let i = 0; i <= N; i++) {
    const t = Math.min(i * dt, T);
    const tau = Math.max(0, T - t);
    const etaT = Math.max(1e-6, etaPath[i]);
    const expectedMeanEta = etaBar + (etaT - etaBar) * ((1 - Math.exp(-kappaEta * Math.max(dt, tau))) / Math.max(1e-6, kappaEta * Math.max(dt, tau)));
    const urgencyFactor = expectedMeanEta / etaT;
    const baseRate = i < N && tau > 0 ? q / tau : 0;
    const optimalRate = i < N ? Math.min(q / dt, baseRate * urgencyFactor) : 0;

    trajectory.push({
      step: i,
      timeSec: t,
      inventory: q,
      currentEta: etaT,
      optimalTradingRate: optimalRate,
      liquidityUrgencyFactor: urgencyFactor,
    });

    if (i < N) {
      totalCost += (etaT * optimalRate * optimalRate + 0.5 * lambda * sigma * sigma * q * q) * dt;
      staticCost += (etaT * staticRate * staticRate + 0.5 * lambda * sigma * sigma * qStatic * qStatic) * dt;
      q = Math.max(0, q - optimalRate * dt);
      qStatic = Math.max(0, qStatic - staticRate * dt);
    }
  }

  const savingsRatio = (staticCost - totalCost) / Math.max(1e-9, staticCost);
  return {
    trajectory,
    totalExecutionCost: totalCost,
    staticAlmgrenBenchmarkCost: staticCost,
    costSavingsBps: savingsRatio * 10000,
  };
}
