import { describe, expect, it } from 'vitest';
import { CarrMadanEngine } from '../../../../src/desk/carrmadan/carrmadan-engine';
import { CarrMadanReplicationTerms, OptionQuoteStrike } from '../../../../src/desk/carrmadan/carrmadan-types';

describe('CarrMadanEngine Suite', () => {
  const engine = new CarrMadanEngine();

  const mockQuotes: OptionQuoteStrike[] = [
    { strikePrice: 80, putPriceUsd: 1.20 },
    { strikePrice: 85, putPriceUsd: 2.10 },
    { strikePrice: 90, putPriceUsd: 3.50 },
    { strikePrice: 95, putPriceUsd: 5.40 },
    { strikePrice: 100, callPriceUsd: 6.20, putPriceUsd: 6.20 },
    { strikePrice: 105, callPriceUsd: 4.10 },
    { strikePrice: 110, callPriceUsd: 2.60 },
    { strikePrice: 115, callPriceUsd: 1.50 },
    { strikePrice: 120, callPriceUsd: 0.80 },
  ];

  const standardTerms: CarrMadanReplicationTerms = {
    spotPrice: 100.0,
    forwardPrice: 100.0,
    timeToExpiryYears: 1.0,
    riskFreeRatePct: 0.0,
    quotes: mockQuotes,
  };

  it('should replicate fair variance strike and extract model-free volatility', () => {
    const result = engine.replicateFairVariance(standardTerms);

    expect(result.fairVarianceStrikePct2).toBeGreaterThan(0);
    expect(result.fairVolatilityStrikePct).toBeGreaterThan(10.0);
    expect(result.fairVolatilityStrikePct).toBeLessThan(40.0);
    expect(result.otmPutsWeightContribution).toBeGreaterThan(0);
    expect(result.otmCallsWeightContribution).toBeGreaterThan(0);
    expect(result.strikeCountUsed).toBeGreaterThanOrEqual(8);
  });

  it('should throw when insufficient option quotes are provided', () => {
    const insufficient: CarrMadanReplicationTerms = {
      ...standardTerms,
      quotes: [{ strikePrice: 100, callPriceUsd: 5.0 }],
    };

    expect(() => engine.replicateFairVariance(insufficient)).toThrow(
      'At least 3 option quotes required'
    );
  });
});
