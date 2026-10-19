/**
 * Wave 296 — Cartea, Jaimungal & Kinzebulatov (2016): FX Triplet Cross-Rate Arbitrage
 * Computes triangular FX log-mispricing and inventory-penalized execution rate.
 */
import type {
  CarteaJaimungal2016FxTripletConfig,
  CarteaJaimungal2016FxTripletResult,
} from './types';

export function computeCarteaJaimungal2016FxTriplet(
  cfg: CarteaJaimungal2016FxTripletConfig,
): CarteaJaimungal2016FxTripletResult {
  const {
    spotRateXY: sXY,
    spotRateYZ: sYZ,
    spotRateXZ: sXZ,
    meanReversionKappa: kappa,
    temporaryImpactEta: eta,
    inventoryPenaltyPhi: phi,
    netTripletInventoryQ: q,
  } = cfg;

  if (sXY <= 0 || sYZ <= 0 || sXZ <= 0 || kappa <= 0 || eta <= 0 || phi <= 0) {
    throw new Error('Invalid CarteaJaimungal2016FxTripletConfig');
  }

  const syntheticXZ = sXY * sYZ;
  const logMispricing = Math.log(syntheticXZ / sXZ);
  const mispricingBps = logMispricing * 10000;
  const alphaVelocity = (kappa * logMispricing) / (2 * eta);
  const inventoryVelocity = -(phi * q) / eta;
  const optimalRate = alphaVelocity + inventoryVelocity;

  return {
    syntheticCrossRateXZ: syntheticXZ,
    logTriangularMispricingBps: mispricingBps,
    alphaSignalVelocity: alphaVelocity,
    inventoryDampingVelocity: inventoryVelocity,
    optimalTripletExecutionRate: optimalRate,
  };
}
