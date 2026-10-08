import { describe, expect, it } from 'vitest';
import { AvellanedaStoikovEngine } from '../../../../src/desk/avellanedastoikov/avellaneda-stoikov-engine';
import { AvellanedaStoikovParams } from '../../../../src/desk/avellanedastoikov/avellaneda-stoikov-types';

describe('Avellaneda-Stoikov (2008) Market Making Suite (Desk 113)', () => {
  const baseParams: AvellanedaStoikovParams = {
    midPrice: 100.0,
    currentInventory: 0,
    targetInventory: 0,
    timeHorizon: 1.0,
    currentTime: 0.0,
    volatility: 0.02,
    riskAversion: 0.1,
    orderArrivalIntensity: 1.5,
    orderArrivalScale: 140.0,
  };

  it('should quote symmetric bid and ask when inventory is neutral', () => {
    const quotes = AvellanedaStoikovEngine.calculateQuotes(baseParams);

    expect(quotes.reservationPrice).toBeCloseTo(baseParams.midPrice, 6);
    expect(quotes.inventoryPenalty).toBeCloseTo(0.0, 6);
    expect(quotes.bidSpread).toBeCloseTo(quotes.askSpread, 6);
    expect(quotes.totalSpread).toBeGreaterThan(0.0);
    expect(quotes.optimalBid).toBeLessThan(baseParams.midPrice);
    expect(quotes.optimalAsk).toBeGreaterThan(baseParams.midPrice);
  });

  it('should skew quotes downward when holding excess long inventory to encourage selling', () => {
    const longParams: AvellanedaStoikovParams = {
      ...baseParams,
      currentInventory: 5, // Long 5 units
    };

    const quotes = AvellanedaStoikovEngine.calculateQuotes(longParams);

    // Reservation price drops below mid-price
    expect(quotes.reservationPrice).toBeLessThan(baseParams.midPrice);
    expect(quotes.inventoryPenalty).toBeGreaterThan(0.0);

    // Ask spread narrows (closer to mid) to attract buyers, bid spread widens (lower bid)
    expect(quotes.askSpread).toBeLessThan(quotes.bidSpread);
    expect(quotes.optimalAsk).toBeLessThan(baseParams.midPrice + quotes.totalSpread / 2);
  });

  it('should skew quotes upward when holding short inventory to encourage buying back', () => {
    const shortParams: AvellanedaStoikovParams = {
      ...baseParams,
      currentInventory: -5, // Short 5 units
    };

    const quotes = AvellanedaStoikovEngine.calculateQuotes(shortParams);

    // Reservation price rises above mid-price
    expect(quotes.reservationPrice).toBeGreaterThan(baseParams.midPrice);
    expect(quotes.inventoryPenalty).toBeLessThan(0.0);

    // Bid spread narrows to attract sellers, ask spread widens
    expect(quotes.bidSpread).toBeLessThan(quotes.askSpread);
  });
});
