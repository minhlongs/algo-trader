import { describe, expect, it } from 'vitest';
import { HasbrouckVarEngine } from '../../../../src/desk/hasbrouck/hasbrouck-var-engine';
import { TradeQuoteObservation } from '../../../../src/desk/hasbrouck/hasbrouck-types';

describe('HasbrouckVarEngine Suite (Desk 76)', () => {
  const engine = new HasbrouckVarEngine();

  // Synthetic deterministic sequence of correlated signed trades and quote revisions
  const generateMarketData = (n: number, permEffect: number): TradeQuoteObservation[] => {
    const data: TradeQuoteObservation[] = [];
    let state = 1;
    for (let i = 0; i < n; i++) {
      // Deterministic pseudo-random trade direction
      state = (state * 1664525 + 1013904223) % 4294967296;
      const trade = state % 3 === 0 ? 1 : state % 3 === 1 ? -1 : 0;
      // Quote return has permanent impact + transitory noise
      const transitoryNoise = ((state % 100) - 50) / 100.0;
      const quoteReturnBps = trade * permEffect + transitoryNoise;
      data.push({ midquoteReturnBps: quoteReturnBps, signedTrade: trade });
    }
    return data;
  };

  it('should estimate positive permanent price impact and information share', () => {
    const observations = generateMarketData(200, 2.5);
    const result = engine.fitVarAndEstimateImpact(observations);

    expect(result.sampleCount).toBe(200);
    expect(result.permanentPriceImpactBps).toBeGreaterThan(0.0);
    expect(result.tradeInformationSharePct).toBeGreaterThan(0.0);
    expect(result.tradeInformationSharePct).toBeLessThanOrEqual(100.0);
    expect(result.longRunInnovationVariance).toBeGreaterThan(0.0);
    expect(result.residualCovariance.sigmaQuote).toBeGreaterThan(0.0);
    expect(result.residualCovariance.sigmaTrade).toBeGreaterThan(0.0);
  });

  it('should throw error when observation count is insufficient (< 10)', () => {
    const fewObs: TradeQuoteObservation[] = [
      { midquoteReturnBps: 1.0, signedTrade: 1 },
      { midquoteReturnBps: -0.5, signedTrade: -1 },
    ];

    expect(() => engine.fitVarAndEstimateImpact(fewObs)).toThrow(
      'At least 10 observations required for Hasbrouck VAR'
    );
  });
});
