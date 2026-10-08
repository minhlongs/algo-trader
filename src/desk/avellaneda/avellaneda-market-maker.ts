import { AvellanedaModelParameters, AvellanedaQuoteResult } from './avellaneda-types';

export class AvellanedaMarketMaker {
  public calculateOptimalQuotes(params: AvellanedaModelParameters): AvellanedaQuoteResult {
    const {
      midPrice: s,
      currentInventory: q,
      volatilityDailyPct,
      timeHorizonHours: T,
      elapsedHours: t,
      inventoryRiskAversionGamma: gamma,
      orderBookLiquidityKappa: kappa,
    } = params;

    if (s <= 0) throw new Error('midPrice must be positive');
    if (gamma <= 0 || Number.isNaN(gamma)) throw new Error('gamma must be positive');
    if (kappa <= 0 || Number.isNaN(kappa)) throw new Error('kappa must be positive');
    if (T <= 0 || t < 0 || t > T) throw new Error('Invalid time horizon or elapsed time');
    if (volatilityDailyPct <= 0) throw new Error('volatilityDailyPct must be positive');

    const tau = Math.max(1e-4, T - t); // Remaining time in hours
    const sigmaHourly = (volatilityDailyPct / 100.0) * s / Math.sqrt(6.5);
    const varianceTerm = sigmaHourly * sigmaHourly;

    // Reservation price: r(s, q, t) = s - q * gamma * sigma^2 * (T - t)
    const inventoryPenalty = q * gamma * varianceTerm * tau;
    const reservationPrice = s - inventoryPenalty;

    // Symmetric liquidity spread: spread = (2 / gamma) * ln(1 + gamma / kappa)
    const halfBaseSpread = (1.0 / gamma) * Math.log(1.0 + gamma / kappa);

    // Optimal quotes anchored to reservation price
    const optimalAsk = reservationPrice + halfBaseSpread;
    const optimalBid = reservationPrice - halfBaseSpread;

    const askSpread = optimalAsk - s;
    const bidSpread = s - optimalBid;
    const totalSpread = optimalAsk - optimalBid;

    // Probability of fill intensity: exp(-kappa * max(0, delta))
    const fillProbBid = Math.exp(-kappa * Math.max(0, bidSpread));
    const fillProbAsk = Math.exp(-kappa * Math.max(0, askSpread));

    return {
      reservationPriceUsd: Number(reservationPrice.toFixed(4)),
      optimalBidPriceUsd: Number(optimalBid.toFixed(4)),
      optimalAskPriceUsd: Number(optimalAsk.toFixed(4)),
      optimalBidSpreadUsd: Number(bidSpread.toFixed(4)),
      optimalAskSpreadUsd: Number(askSpread.toFixed(4)),
      totalOptimalSpreadUsd: Number(totalSpread.toFixed(4)),
      inventorySkewUsd: Number(inventoryPenalty.toFixed(4)),
      fillProbabilityBid: Number(Math.min(1.0, Math.max(0.0, fillProbBid)).toFixed(4)),
      fillProbabilityAsk: Number(Math.min(1.0, Math.max(0.0, fillProbAsk)).toFixed(4)),
    };
  }
}
