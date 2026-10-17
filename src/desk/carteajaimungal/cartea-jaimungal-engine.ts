import { CarteaJaimungalParams, CarteaJaimungalQuotes } from './cartea-jaimungal-types';
import { calculateRiccatiCoefficient } from './cartea-jaimungal-math';

export class CarteaJaimungalEngine {
  public static calculateQuotes(params: CarteaJaimungalParams): CarteaJaimungalQuotes {
    const {
      midPrice: s,
      currentInventory: q,
      timeHorizon: T,
      currentTime: t,
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

    const hTau = calculateRiccatiCoefficient(phi, alphaTerm, remainingTime);

    // Inventory penalty shift and alpha tilt
    const inventoryPenalty = (2.0 * netInventory) * (hTau / k);
    const alphaTilt = alphaDrift / k;

    // Reservation price (indifference price)
    const reservationPrice = s - inventoryPenalty + alphaTilt;

    // Base liquidity half-spread
    const baseHalfSpread = (1.0 / k) * Math.log(1.0 + k / A) + 0.5 / k;

    // Optimal quoting distances from mid-price
    // Long inventory (netInventory > 0 -> inventoryPenalty > 0): skews reservation price down,
    // narrows ask spread (liquidate faster) and widens bid spread
    // Bullish alpha drift (alphaTilt > 0): tilts reservation price up, widens ask spread and narrows bid spread
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
