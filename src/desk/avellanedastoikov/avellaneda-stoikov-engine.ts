import { AvellanedaStoikovParams, AvellanedaStoikovQuotes } from './avellaneda-stoikov-types';

export class AvellanedaStoikovEngine {
  /**
   * Implements the foundational High-Frequency Market Making model by Avellaneda & Stoikov (2008).
   *
   * 1. Reservation Price:
   *    r(s, q, t) = s - (q - q_target) * gamma * sigma^2 * (T - t)
   *
   * 2. Optimal Half-Spreads:
   *    delta_a + delta_b = gamma * sigma^2 * (T - t) + (2 / gamma) * ln(1 + gamma / kappa)
   *    delta_a = (r(s, q, t) - s) + 0.5 * totalSpread
   *    delta_b = (s - r(s, q, t)) + 0.5 * totalSpread
   *
   * 3. Optimal Limit Quotes:
   *    r_a = s + delta_a
   *    r_b = s - delta_b
   */
  public static calculateQuotes(params: AvellanedaStoikovParams): AvellanedaStoikovQuotes {
    const {
      midPrice: s,
      currentInventory: q,
      targetInventory: qTarget,
      timeHorizon: T,
      currentTime: t,
      volatility: sigma,
      riskAversion: gamma,
      orderArrivalIntensity: kappa,
    } = params;

    if (s <= 0 || sigma <= 0 || gamma <= 0 || kappa <= 0) {
      throw new Error('Mid-price, volatility, gamma, and kappa must be strictly positive');
    }

    const remainingTime = Math.max(0.0001, T - t);

    // Reservation (indifference) price r(s, q, t)
    const netInventory = q - qTarget;
    const inventoryPenalty = netInventory * gamma * sigma * sigma * remainingTime;
    const reservationPrice = s - inventoryPenalty;

    // Total optimal spread around reservation price
    // totalSpread = (2 / gamma) * ln(1 + gamma / kappa)
    const liquidityTerm = (2.0 / gamma) * Math.log(1.0 + gamma / kappa);
    const halfSpread = 0.5 * liquidityTerm;

    // Quoted prices:
    // Ask quote: r_a = reservationPrice + halfSpread
    // Bid quote: r_b = reservationPrice - halfSpread
    const optimalAsk = reservationPrice + halfSpread;
    const optimalBid = reservationPrice - halfSpread;

    const askSpread = optimalAsk - s;
    const bidSpread = s - optimalBid;
    const totalSpread = optimalAsk - optimalBid;

    return {
      reservationPrice,
      optimalBid,
      optimalAsk,
      bidSpread,
      askSpread,
      totalSpread,
      inventoryPenalty,
    };
  }
}
