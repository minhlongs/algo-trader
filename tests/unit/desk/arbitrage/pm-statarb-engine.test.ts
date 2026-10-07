import { describe, it, expect } from 'vitest';
import { PmStatArbEngine } from '../../../../src/desk/arbitrage/pm-statarb-engine';
import type { PriceObservation } from '../../../../src/desk/arbitrage/pm-statarb-types';

describe('PmStatArbEngine', () => {
  const engine = new PmStatArbEngine({ minObservations: 10, entryZScore: 2.0 });

  it('calibrates model and detects cointegrated mean-reverting spread', () => {
    const history: PriceObservation[] = [];
    const basePrice = 0.5;
    let spread = 0.05;
    for (let i = 0; i < 40; i++) {
      // Mean-reverting AR(1) around 0.05: s_t = 0.05 + 0.4 * (s_{t-1} - 0.05) + shock
      const shock = ((i % 2 === 0 ? 0.01 : -0.01) * 0.5);
      spread = 0.05 + 0.4 * (spread - 0.05) + shock;
      const pB = basePrice + (i % 5) * 0.005;
      history.push({
        timestamp: 1000 + i * 60000,
        priceA: pB + spread,
        priceB: pB,
      });
    }

    const model = engine.calibrateModel(history);
    expect(model).not.toBeNull();
    expect(model?.isCointegrated).toBe(true);
    expect(model?.halfLifePeriods).toBeGreaterThan(0);
    expect(model?.halfLifePeriods).toBeLessThan(50);
  });

  it('generates LONG_SPREAD signal on severe negative z-score', () => {
    const model = {
      hedgeRatio: 1.0,
      intercept: 0.0,
      meanSpread: 0.0,
      spreadStdDev: 0.01,
      halfLifePeriods: 10,
      isCointegrated: true,
    };

    // priceA is deeply undervalued relative to priceB: spread is -0.025 (z = -2.5)
    const signal = engine.generateSignal({
      pairId: 'poly-kalshi-election',
      latestPriceA: 0.48,
      latestPriceB: 0.505,
      model,
    });

    expect(signal.direction).toBe('LONG_SPREAD');
    expect(signal.zScore).toBeLessThan(-2.0);
    expect(signal.confidence).toBeGreaterThan(0.9);
  });

  it('returns NO_SIGNAL when model is not cointegrated', () => {
    const model = {
      hedgeRatio: 1.0,
      intercept: 0.0,
      meanSpread: 0.0,
      spreadStdDev: 0.01,
      halfLifePeriods: Infinity,
      isCointegrated: false,
    };

    const signal = engine.generateSignal({
      pairId: 'random-pair',
      latestPriceA: 0.45,
      latestPriceB: 0.55,
      model,
    });

    expect(signal.direction).toBe('NO_SIGNAL');
    expect(signal.confidence).toBe(0);
  });
});
