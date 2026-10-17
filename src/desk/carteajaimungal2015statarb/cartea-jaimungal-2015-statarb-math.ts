/**
 * Wave 284 — Cartea, Jaimungal & Penalva (2015): Statistical Arbitrage and Pairs Trading with Execution Cost
 * Computes HJB optimal trading velocity for co-integrated Ornstein-Uhlenbeck spread pairs.
 */
import type {
  Cartea2015StatArbConfig,
  Cartea2015StatArbResult,
} from './types';

export function computeCartea2015StatArbQuote(
  cfg: Cartea2015StatArbConfig,
): Cartea2015StatArbResult {
  const {
    currentSpreadX: x,
    equilibriumTheta: theta,
    meanReversionKappa: kappa,
    currentInventoryQ: q,
    temporaryImpactEta: eta,
    riskAversionPhi: phi,
    remainingHorizonSec: tau,
  } = cfg;

  if (kappa <= 0 || eta <= 0 || phi <= 0 || tau <= 0) {
    throw new Error('Invalid Cartea2015StatArbConfig: kappa, eta, phi, and tau must be positive');
  }

  const mispricing = theta - x;
  const gamma = Math.sqrt(phi / eta);
  const cothFactor = Math.cosh(gamma * tau) / Math.max(1e-8, Math.sinh(gamma * tau));

  const alphaSignal = (kappa * mispricing) / (kappa + gamma);
  const targetInventory = alphaSignal / (2 * phi);
  const velocityNu = (alphaSignal - 2 * eta * gamma * cothFactor * q) / (2 * eta);
  const halfLife = Math.LN2 / kappa;

  return {
    spreadMispricing: mispricing,
    targetEquilibriumInventory: targetInventory,
    optimalTradingVelocityNu: velocityNu,
    expectedConvergenceHalfLifeSec: halfLife,
  };
}
