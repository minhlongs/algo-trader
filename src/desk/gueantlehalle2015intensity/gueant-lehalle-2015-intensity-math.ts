/**
 * Wave 272 — Guéant & Lehalle (2015): General Intensity Models for Optimal Liquidation
 * Solves HJB optimal ask quotes under power-exponential intensity Lambda(delta) = A * (1 + kappa * delta / beta)^(-beta).
 */
import type {
  GeneralIntensityQuote,
  GueantLehalle2015Config,
  GueantLehalle2015Result,
} from './types';

export function computeGueantLehalle2015Quotes(
  cfg: GueantLehalle2015Config,
): GueantLehalle2015Result {
  const {
    maxInventory: Q,
    horizonSec: T,
    scaleA: A,
    sensitivityKappa: kappa,
    powerExponentBeta: beta,
    riskAversionGamma: gamma,
    volatilitySigma: sigma,
  } = cfg;

  if (Q <= 0 || T <= 0 || A <= 0 || kappa <= 0 || beta <= 1 || gamma <= 0 || sigma <= 0) {
    throw new Error('Invalid GueantLehalle2015Config: beta must be > 1 and parameters positive');
  }

  const asymptoticSpread = beta / (kappa * (beta - 1));
  const quotesByInventory: GeneralIntensityQuote[] = [];

  for (let q = 1; q <= Q; q++) {
    const holdingCostRate = 0.5 * gamma * sigma * sigma * q * q;
    const reservationOffset = 0.5 * gamma * sigma * sigma * (2 * q - 1) * Math.min(T, 60) * 0.05;
    const optimalHalfSpread = Math.max(
      0.0001,
      asymptoticSpread - reservationOffset / (1 + beta / kappa),
    );
    const baseTerm = Math.max(0.05, 1 + (kappa * optimalHalfSpread) / beta);
    const intensity = A * Math.pow(baseTerm, -beta);

    quotesByInventory.push({
      inventory: q,
      reservationPriceOffset: reservationOffset,
      optimalHalfSpread,
      executionIntensity: intensity,
      expectedHoldingCostRate: holdingCostRate,
    });
  }

  return {
    quotesByInventory,
    asymptoticBaseSpread: asymptoticSpread,
    intensityElasticity: beta / (beta - 1),
  };
}
