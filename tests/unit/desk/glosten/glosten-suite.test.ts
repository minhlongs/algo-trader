import { describe, expect, it } from 'vitest';
import { GlostenMilgromEngine } from '../../../../src/desk/glosten/glosten-milgrom-engine';
import { GlostenMilgromParameters, TradeAction } from '../../../../src/desk/glosten/glosten-types';

describe('GlostenMilgromEngine Suite', () => {
  const engine = new GlostenMilgromEngine();

  const standardParams: GlostenMilgromParameters = {
    highAssetValueVHigh: 120.0,
    lowAssetValueVLow: 80.0,
    priorProbabilityHigh: 0.50,
    fractionInformedTradersAlpha: 0.25, // 25% informed traders
  };

  it('should quote positive bid-ask spread driven by adverse selection', () => {
    const quotes = engine.computeQuotes(0.5, standardParams);

    // E[V] = 0.5 * 120 + 0.5 * 80 = 100
    expect(quotes.midPriceUsd).toBe(100.0);
    expect(quotes.askPriceUsd).toBeGreaterThan(100.0);
    expect(quotes.bidPriceUsd).toBeLessThan(100.0);
    expect(quotes.bidAskSpreadUsd).toBeGreaterThan(0.0);
    expect(quotes.adverseSelectionSpreadPct).toBeGreaterThan(0.0);
  });

  it('should sequentially update posterior probability and prices on sequential buy trades', () => {
    const consecutiveBuys: TradeAction[] = ['BUY', 'BUY', 'BUY'];
    const steps = engine.simulateSequentialTrades(consecutiveBuys, standardParams);

    expect(steps.length).toBe(3);
    // Consecutive buys signal informed buying -> P(V_H) increases monotonically
    expect(steps[0]!.posteriorProbabilityHigh).toBeGreaterThan(0.50);
    expect(steps[1]!.posteriorProbabilityHigh).toBeGreaterThan(steps[0]!.posteriorProbabilityHigh);
    expect(steps[2]!.posteriorProbabilityHigh).toBeGreaterThan(steps[1]!.posteriorProbabilityHigh);
    // Expected asset value increases towards V_H = 120
    expect(steps[2]!.expectedAssetValueUsd).toBeGreaterThan(steps[0]!.expectedAssetValueUsd);
  });

  it('should throw when V_High is not greater than V_Low', () => {
    const invalid: GlostenMilgromParameters = {
      ...standardParams,
      highAssetValueVHigh: 80.0,
      lowAssetValueVLow: 120.0,
    };

    expect(() => engine.computeQuotes(0.5, invalid)).toThrow('V_High must be strictly greater than V_Low');
  });
});
