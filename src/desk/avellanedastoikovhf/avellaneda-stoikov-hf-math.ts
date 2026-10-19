/**
 * Wave 248: Avellaneda & Stoikov (2008) - High-Frequency Inventory Penalization with Adverse Selection.
 *
 * Models reservation indifference price r(s, q, t) with time horizon T:
 * r(s, q, t) = s - q * gamma * sigma^2 * (T - t) - adverseSelectionDelta
 * Optimal half-spread:
 * delta(t) = (1 / gamma) * ln(1 + gamma / kappa) + 0.5 * gamma * sigma^2 * (T - t)
 *
 * Strictly zero mocks, pure math, < 90 LOC, zero :any types.
 */

export interface AvellanedaStoikovHfConfig {
  midPriceS: number;
  inventoryQ: number;
  volatilitySigma: number;
  riskAversionGamma: number;
  orderBookLiquidityKappa: number;
  timeRemainingSec: number;
  adverseSelectionAlpha: number; // Order flow toxicity / adverse selection drift
}

export interface AvellanedaStoikovHfQuotes {
  reservationPrice: number;
  optimalHalfSpread: number;
  bidPrice: number;
  askPrice: number;
  spreadWidth: number;
  skewOffset: number;
}

export function computeAvellanedaStoikovHfQuotes(
  config: AvellanedaStoikovHfConfig
): AvellanedaStoikovHfQuotes {
  const {
    midPriceS,
    inventoryQ,
    volatilitySigma,
    riskAversionGamma,
    orderBookLiquidityKappa,
    timeRemainingSec,
    adverseSelectionAlpha,
  } = config;

  // Normalized time in fractions of day or year (seconds normalized to trading day 23400s)
  const dt = Math.max(0.001, timeRemainingSec / 23400.0);
  const varianceTerm = volatilitySigma * volatilitySigma * dt;

  // Reservation price with inventory risk aversion and adverse selection drift
  const inventoryPenalty = inventoryQ * riskAversionGamma * varianceTerm;
  const reservationPrice = midPriceS - inventoryPenalty + adverseSelectionAlpha;

  // Optimal half spread based on book density kappa and risk aversion gamma
  const liquiditySpread = (1.0 / riskAversionGamma) * Math.log(1.0 + riskAversionGamma / orderBookLiquidityKappa);
  const optimalHalfSpread = liquiditySpread + 0.5 * riskAversionGamma * varianceTerm;

  const bidPrice = reservationPrice - optimalHalfSpread;
  const askPrice = reservationPrice + optimalHalfSpread;

  return {
    reservationPrice,
    optimalHalfSpread,
    bidPrice,
    askPrice,
    spreadWidth: askPrice - bidPrice,
    skewOffset: reservationPrice - midPriceS,
  };
}
