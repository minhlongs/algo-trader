import { CarteaJaimungalParams, CarteaJaimungalQuotes } from './cartea-jaimungal-types';

export class CarteaJaimungalEngine {
  public static calculateQuotes(params: CarteaJaimungalParams): CarteaJaimungalQuotes {
    const {
      midPrice: s,
      currentInventory: q,
      timeHorizon: T,
      currentTime: t,
      volatility: sigma,
      runningInventoryPenalty: phi,
      terminalLiquidationPenalty: alphaTerm,
      orderArrivalIntensity: A,
      orderArrivalSensitivity: k,
    } = params;

    if (s <= 0 || T <= 0 || A <= 0 || k <= 0) {
      throw new Error('Mid-price, time horizon, arrival intensity A, and sensitivity k must be strictly positive');
    }
    if (phi < 0 || alphaTerm < 0) {
      throw new Error('Inventory penalties phi and alphaTerm must be non-negative');
    }

    const qTarget = params.targetInventory !== undefined ? params.targetInventory : 0;
    const alphaDrift = params.alphaDrift !== undefined ? params.alphaDrift : 0.0;
    const remainingTime = Math.max(0.0001, T - t);
    const netInventory = q - qTarget;

    // Riccati solution for inventory penalty coefficient h(tau)
    // h(tau) = sqrt(phi) * [alphaTerm * cosh(sqrt(phi)*tau) + sqrt(phi) * sinh(sqrt(phi)*tau)] /
    //                      [sqrt(phi) * cosh(sqrt(phi)*tau) + alphaTerm * sinh(sqrt(phi)*tau)]
    const sqrtPhi = Math.sqrt(Math.max(1e-8, phi));
    const arg = sqrtPhi * remainingTime;
    const coshArg = Math.cosh(Math.min(20.0, arg));
    const sinhArg = Math.sinh(Math.min(20.0, arg));

    const num = alphaTerm * coshArg + sqrtPhi * sinhArg;
    const den = sqrtPhi * coshArg + alphaTerm * sinhArg;
    const hTau = sqrtPhi * (num / Math.max(1e-8, den));

    // Inventory penalty shift and alpha tilt
    const inventoryPenalty = (2.0 * netInventory) * (hTau / k);
    const alphaTilt = alphaDrift / k;

    // Reservation price (indifference price)
    const reservationPrice = s - inventoryPenalty + alphaTilt;

    // Base liquidity half-spread
    const baseHalfSpread = (1.0 / k) * Math.log(1.0 + k / A) + 0.5 / k;

    // Optimal quoting distances from mid-price
    let askSpread = baseHalfSpread - inventoryPenalty + alphaTilt;
    let bidSpread = baseHalfSpread + inventoryPenalty - alphaTilt;

    // Guard positive spreads
    const minSpread = 0.0001;
    if (askSpread < minSpread) {
      askSpread = minSpread;
    }
    if (bidSpread < minSpread) {
      bidSpread = minSpread;
    }

    const optimalAsk = s + askSpread;
    const optimalBid = s - bidSpread;
    const totalSpread = optimalAsk - optimalBid;

    return {
      reservationPrice,
      optimalBid,
      optimalAsk,
      bidSpread,
      askSpread,
      totalSpread,
      inventorySkew: inventoryPenalty,
      alphaTilt,
    };
  }
}
