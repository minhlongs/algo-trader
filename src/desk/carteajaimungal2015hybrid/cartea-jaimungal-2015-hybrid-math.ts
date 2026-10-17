/**
 * Wave 293 — Cartea & Jaimungal (2015): Hybrid Limit and Market Order Execution
 * Computes switching boundary between pure limit-order posting and hybrid market sweeps.
 */
import type {
  CarteaJaimungal2015HybridConfig,
  CarteaJaimungal2015HybridResult,
} from './types';

export function computeCarteaJaimungal2015Hybrid(
  cfg: CarteaJaimungal2015HybridConfig,
): CarteaJaimungal2015HybridResult {
  const {
    currentInventoryQ: q,
    remainingHorizonSec: tau,
    quotedHalfSpreadDelta: delta,
    limitFillIntensityLambda: lambdaFill,
    temporaryImpactEta: eta,
    inventoryUrgencyPhi: phi,
  } = cfg;

  if (q <= 0 || tau <= 0 || delta <= 0 || lambdaFill <= 0 || eta <= 0 || phi <= 0) {
    throw new Error('Invalid CarteaJaimungal2015HybridConfig: parameters must be positive');
  }

  const kappa = Math.sqrt(phi / eta);
  const marginalHoldingPressure = eta * kappa / Math.tanh(kappa * tau);
  const qStar = (delta + lambdaFill * eta) / marginalHoldingPressure;

  const rawSweep = (marginalHoldingPressure * q - delta) / (2 * eta);
  const aggressiveMarketSweepRate = Math.max(0, rawSweep);
  const regimeMode =
    q > qStar ? 'HYBRID_LIMIT_AND_MARKET' : 'PASSIVE_LIMIT_ONLY';

  return {
    criticalSwitchInventoryQStar: qStar,
    postLimitExpectedRate: lambdaFill,
    aggressiveMarketSweepRate,
    regimeMode,
  };
}
