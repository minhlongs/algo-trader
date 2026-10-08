import { describe, expect, it } from 'vitest';
import { CarteaJaimungalEngine } from '../../../../src/desk/carteajaimungal/cartea-jaimungal-engine';
import { CarteaJaimungalParams } from '../../../../src/desk/carteajaimungal/cartea-jaimungal-types';

describe('Cartea-Jaimungal (2014) Algorithmic Market Making Suite (Desk 116)', () => {
  const baseParams: CarteaJaimungalParams = {
    midPrice: 100.0,
    currentInventory: 0,
    targetInventory: 0,
    timeHorizon: 1.0,
    currentTime: 0.0,
    volatility: 0.02,
    runningInventoryPenalty: 0.1,
    terminalLiquidationPenalty: 0.5,
    orderArrivalIntensity: 1.4,
    orderArrivalSensitivity: 1.5,
    alphaDrift: 0.0,
  };

  it('should quote symmetric bid and ask when inventory and alpha are neutral', () => {
    const quotes = CarteaJaimungalEngine.calculateQuotes(baseParams);

    expect(quotes.reservationPrice).toBeCloseTo(baseParams.midPrice, 5);
    expect(quotes.inventorySkew).toBeCloseTo(0.0, 5);
    expect(quotes.alphaTilt).toBeCloseTo(0.0, 5);
    expect(quotes.bidSpread).toBeCloseTo(quotes.askSpread, 5);
    expect(quotes.optimalBid).toBeLessThan(baseParams.midPrice);
    expect(quotes.optimalAsk).toBeGreaterThan(baseParams.midPrice);
    expect(quotes.totalSpread).toBeGreaterThan(0.0);
  });

  it('should skew quotes downward when holding long inventory to liquidate risk', () => {
    const longQuotes = CarteaJaimungalEngine.calculateQuotes({
      ...baseParams,
      currentInventory: 5,
    });

    expect(longQuotes.reservationPrice).toBeLessThan(baseParams.midPrice);
    expect(longQuotes.inventorySkew).toBeGreaterThan(0.0);
    expect(longQuotes.askSpread).toBeLessThan(longQuotes.bidSpread);
    expect(longQuotes.optimalAsk).toBeLessThan(baseParams.midPrice + longQuotes.totalSpread / 2);
  });

  it('should skew quotes upward when holding short inventory to buy back', () => {
    const shortQuotes = CarteaJaimungalEngine.calculateQuotes({
      ...baseParams,
      currentInventory: -5,
    });

    expect(shortQuotes.reservationPrice).toBeGreaterThan(baseParams.midPrice);
    expect(shortQuotes.inventorySkew).toBeLessThan(0.0);
    expect(shortQuotes.bidSpread).toBeLessThan(shortQuotes.askSpread);
  });

  it('should adjust quotes for positive directional alpha drift', () => {
    const alphaQuotes = CarteaJaimungalEngine.calculateQuotes({
      ...baseParams,
      alphaDrift: 0.3,
    });

    expect(alphaQuotes.reservationPrice).toBeGreaterThan(baseParams.midPrice);
    expect(alphaQuotes.alphaTilt).toBeGreaterThan(0.0);
    // Bullish drift raises ask spread (avoid selling too cheap) and narrows bid spread (accumulate early)
    expect(alphaQuotes.askSpread).toBeGreaterThan(alphaQuotes.bidSpread);
  });

  it('should throw an error for non-positive structural parameters', () => {
    expect(() => CarteaJaimungalEngine.calculateQuotes({ ...baseParams, midPrice: 0 })).toThrow(/must be strictly positive/i);
    expect(() => CarteaJaimungalEngine.calculateQuotes({ ...baseParams, orderArrivalIntensity: -1 })).toThrow(/must be strictly positive/i);
    expect(() => CarteaJaimungalEngine.calculateQuotes({ ...baseParams, runningInventoryPenalty: -0.1 })).toThrow(/must be non-negative/i);
  });
});
