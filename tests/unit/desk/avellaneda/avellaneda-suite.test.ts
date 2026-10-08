import { describe, expect, it } from 'vitest';
import { AvellanedaMarketMaker } from '../../../../src/desk/avellaneda/avellaneda-market-maker';
import { AvellanedaModelParameters } from '../../../../src/desk/avellaneda/avellaneda-types';

describe('AvellanedaMarketMaker Suite', () => {
  const mm = new AvellanedaMarketMaker();

  const baseParams: AvellanedaModelParameters = {
    midPrice: 100.0,
    currentInventory: 0,
    volatilityDailyPct: 2.0,
    timeHorizonHours: 6.5,
    elapsedHours: 0.5,
    inventoryRiskAversionGamma: 0.1,
    orderBookLiquidityKappa: 1.5,
  };

  it('should quote symmetric bid-ask spread around mid when inventory is zero', () => {
    const quotes = mm.calculateOptimalQuotes(baseParams);

    expect(quotes.reservationPriceUsd).toBe(100.0);
    expect(quotes.inventorySkewUsd).toBe(0.0);
    expect(quotes.optimalBidPriceUsd).toBeLessThan(100.0);
    expect(quotes.optimalAskPriceUsd).toBeGreaterThan(100.0);
    expect(quotes.optimalBidSpreadUsd).toBeCloseTo(quotes.optimalAskSpreadUsd, 2);
    expect(quotes.fillProbabilityBid).toBeGreaterThan(0);
    expect(quotes.fillProbabilityAsk).toBeGreaterThan(0);
  });

  it('should skew quotes downwards when carrying long inventory to induce selling', () => {
    const quotesZero = mm.calculateOptimalQuotes(baseParams);
    const longParams: AvellanedaModelParameters = {
      ...baseParams,
      currentInventory: 50, // Long 50 units
    };

    const quotes = mm.calculateOptimalQuotes(longParams);

    // Reservation price drops below mid to offload inventory
    expect(quotes.reservationPriceUsd).toBeLessThan(100.0);
    expect(quotes.inventorySkewUsd).toBeGreaterThan(0);
    // Both bid and ask quotes shift lower compared to neutral inventory
    expect(quotes.optimalAskPriceUsd).toBeLessThan(quotesZero.optimalAskPriceUsd);
    expect(quotes.optimalBidPriceUsd).toBeLessThan(quotesZero.optimalBidPriceUsd);
    // Lower ask spread relative to mid stimulates buyer execution on our ask
    expect(quotes.fillProbabilityAsk).toBeGreaterThan(quotes.fillProbabilityBid);
  });

  it('should throw when market making parameters are non-positive or invalid', () => {
    const invalid: AvellanedaModelParameters = {
      ...baseParams,
      inventoryRiskAversionGamma: -0.5,
    };

    expect(() => mm.calculateOptimalQuotes(invalid)).toThrow('gamma must be positive');
  });
});
