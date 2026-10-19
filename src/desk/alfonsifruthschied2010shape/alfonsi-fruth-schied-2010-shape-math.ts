/**
 * Wave 283 — Alfonsi, Fruth & Schied (2010): Optimal Execution in Limit Order Books with General Shape Functions
 * Computes U-shaped initial/terminal discrete block trades and intermediate bucket trades under non-linear LOB density.
 */
import type {
  Alfonsi2010ShapeConfig,
  Alfonsi2010ShapeResult,
  DiscreteBlockTrade,
} from './types';

export function computeAlfonsi2010ShapeExecution(
  cfg: Alfonsi2010ShapeConfig,
): Alfonsi2010ShapeResult {
  const {
    initialInventoryX0: X0,
    horizonSec: T,
    numIntermediateBlocksN: N,
    resilienceRateRho: rho,
    bookDensityAlpha: alpha,
    shapeExponentBeta: beta,
  } = cfg;

  if (X0 <= 0 || T <= 0 || N < 1 || rho <= 0 || alpha <= 0 || beta <= 0) {
    throw new Error('Invalid Alfonsi2010ShapeConfig: parameters must be strictly positive');
  }

  const dt = T / N;
  const decay = Math.exp(-rho * dt);
  const intermediateWeight = 1 - decay;
  const denom = 2 + (N - 1) * intermediateWeight;

  const boundaryBlockSize = X0 / denom;
  const interiorBlockSize = (X0 * intermediateWeight) / denom;

  const blocks: DiscreteBlockTrade[] = [];
  let volumeShiftE = 0;
  let totalCost = 0;

  for (let k = 0; k <= N; k++) {
    if (k > 0) {
      volumeShiftE *= decay;
    }
    const size = k === 0 || k === N ? boundaryBlockSize : interiorBlockSize;
    const preE = volumeShiftE;
    const postE = preE + size;
    const postDisplacement = Math.pow(postE / alpha, 1 / beta);
    const stepCost = (alpha / (1 + 1 / beta)) * (Math.pow(postE / alpha, 1 + 1 / beta) - Math.pow(preE / alpha, 1 + 1 / beta));

    totalCost += stepCost;
    volumeShiftE = postE;

    blocks.push({
      blockIndex: k,
      timeSec: k * dt,
      tradeSize: size,
      postTradePriceDisplacement: postDisplacement,
    });
  }

  return {
    blocks,
    initialBlockRatio: boundaryBlockSize / X0,
    terminalBlockRatio: boundaryBlockSize / X0,
    totalNonlinearImpactCost: totalCost,
  };
}
