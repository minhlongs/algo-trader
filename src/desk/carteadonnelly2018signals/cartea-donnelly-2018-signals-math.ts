/**
 * Wave 275 — Cartea, Donnelly & Jaimungal (2018): Enhancing Trading Strategies with Order Book Signals
 * Computes multi-level weighted Volume Order Imbalance (VOI) and signal-conditioned optimal trading speed.
 */
import type {
  CarteaDonnelly2018Config,
  CarteaDonnelly2018Result,
} from './types';

export function computeCarteaDonnelly2018Signal(
  cfg: CarteaDonnelly2018Config,
): CarteaDonnelly2018Result {
  const {
    levels,
    depthDecayAlpha: alpha,
    signalDriftKappa: kappa,
    temporaryImpactEta: eta,
    baselineLiquidationRate: nu0,
  } = cfg;

  if (levels.length === 0 || alpha < 0 || eta <= 0 || nu0 < 0) {
    throw new Error('Invalid CarteaDonnelly2018Config: empty levels or invalid parameters');
  }

  const levelWeights: number[] = [];
  let weightedBid = 0;
  let weightedAsk = 0;

  for (let i = 0; i < levels.length; i++) {
    const { bidVolume, askVolume } = levels[i];
    if (bidVolume < 0 || askVolume < 0) {
      throw new Error('Order book volumes must be non-negative');
    }
    const w = Math.exp(-alpha * i);
    levelWeights.push(w);
    weightedBid += w * bidVolume;
    weightedAsk += w * askVolume;
  }

  const totalWeightedVol = Math.max(1e-9, weightedBid + weightedAsk);
  const imbalance = (weightedBid - weightedAsk) / totalWeightedVol;
  const expectedDrift = kappa * imbalance;
  const signalSkew = -expectedDrift / (2 * eta);
  const adjustedRate = Math.max(0, nu0 + signalSkew);
  const urgencyMultiplier = nu0 > 1e-6 ? adjustedRate / nu0 : 1.0;

  return {
    multiLevelImbalance: imbalance,
    levelWeights,
    expectedShortTermDrift: expectedDrift,
    signalAdjustedTradingRate: adjustedRate,
    executionUrgencyMultiplier: urgencyMultiplier,
  };
}
