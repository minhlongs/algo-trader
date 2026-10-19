import { AvellanedaGueantJumpConfig, MarketMakerQuoteState } from './types';

/**
 * Wave 255: Avellaneda-Stoikov / Guéant Jump-Diffusion Market Making Quotes.
 * Strictly < 80 LOC, zero :any.
 */
export function computeAvellanedaGueantJumpQuotes(
  config: AvellanedaGueantJumpConfig
): MarketMakerQuoteState {
  const {
    riskGamma,
    volatilitySigma,
    jumpIntensityLambda,
    jumpMeanMu,
    jumpSigma,
    terminalTimeT,
    kappaOrderBook,
  } = config;
  const s = config.midPriceS ?? 100.0;
  const q = config.inventoryQ ?? 0;
  const tick = Math.max(1e-4, config.tickSize ?? 0.01);
  const tau = Math.max(1e-4, terminalTimeT);

  // Jump hazard components: variance penalty and drift hazard
  const jumpVarianceHazard = jumpIntensityLambda * (jumpSigma * jumpSigma + jumpMeanMu * jumpMeanMu);
  const effectiveVariance = volatilitySigma * volatilitySigma + jumpVarianceHazard;
  const jumpDriftHazard = jumpIntensityLambda * jumpMeanMu;

  // Reservation indifference price with jump drift hazard adjustment
  const reservationPrice = s - q * riskGamma * effectiveVariance * tau + jumpDriftHazard * tau;

  // Baseline liquidity half-spread from Guéant (2012)
  const baseHalfSpread =
    (1 / riskGamma) * Math.log(1 + riskGamma / kappaOrderBook) + 0.5 * riskGamma * effectiveVariance * tau;

  // Jump asymmetry penalty under non-zero jump mean
  const jumpAsymmetryPenalty = 0.5 * riskGamma * jumpIntensityLambda * jumpMeanMu * tau;

  let deltaA = (reservationPrice - s) + baseHalfSpread + jumpAsymmetryPenalty;
  let deltaB = (s - reservationPrice) + baseHalfSpread - jumpAsymmetryPenalty;

  // Clamp minimum spread >= tick size
  const minHalf = tick / 2;
  deltaA = Math.max(minHalf, deltaA);
  deltaB = Math.max(minHalf, deltaB);
  if (deltaA + deltaB < tick) {
    deltaA = minHalf;
    deltaB = minHalf;
  }

  const askPrice = s + deltaA;
  const bidPrice = s - deltaB;

  return {
    reservationPrice,
    deltaA,
    deltaB,
    bidPrice,
    askPrice,
    totalSpread: askPrice - bidPrice,
    jumpVarianceHazard,
    jumpDriftHazard,
  };
}
