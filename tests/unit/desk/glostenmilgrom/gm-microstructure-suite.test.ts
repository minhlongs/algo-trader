import { describe, it, expect } from 'vitest';
import { GlostenMilgromEngine } from '../../../../src/desk/glostenmilgrom/gm-microstructure-engine';

describe('GlostenMilgromEngine — Sequential Trade Information Asymmetry Suite', () => {
  it('yields zero bid-ask spread when informed trader fraction is zero', () => {
    const res = GlostenMilgromEngine.calculate({
      lowValue: 50.0,
      highValue: 100.0,
      priorProbabilityHigh: 0.5,
      informedFraction: 0.0,
      noiseBuyProbability: 0.5,
    });

    expect(res.currentQuotes.spread).toBeCloseTo(0.0, 6);
    expect(res.currentQuotes.ask).toBeCloseTo(75.0, 6);
    expect(res.currentQuotes.bid).toBeCloseTo(75.0, 6);
    expect(res.informationShare).toBeCloseTo(0.0, 6);
  });

  it('widens the bid-ask spread monotonically with the informed trader fraction', () => {
    const lowAlpha = GlostenMilgromEngine.calculate({
      lowValue: 40.0,
      highValue: 80.0,
      priorProbabilityHigh: 0.5,
      informedFraction: 0.15,
    });

    const highAlpha = GlostenMilgromEngine.calculate({
      lowValue: 40.0,
      highValue: 80.0,
      priorProbabilityHigh: 0.5,
      informedFraction: 0.5,
    });

    expect(highAlpha.currentQuotes.spread).toBeGreaterThan(lowAlpha.currentQuotes.spread);
    expect(highAlpha.informationShare).toBeGreaterThan(lowAlpha.informationShare);
  });

  it('updates posterior belief towards high value on consecutive buy orders', () => {
    const res = GlostenMilgromEngine.calculate({
      lowValue: 10.0,
      highValue: 20.0,
      priorProbabilityHigh: 0.5,
      informedFraction: 0.3,
      tradeSequence: [1, 1, 1, 1, 1], // 5 consecutive buys
    });

    expect(res.finalBeliefProbability).toBeGreaterThan(0.85);
    expect(res.currentQuotes.midPrice).toBeGreaterThan(18.0);
    expect(res.beliefHistory[res.beliefHistory.length - 1]).toBeGreaterThan(res.beliefHistory[0]);
  });

  it('updates posterior belief towards low value on consecutive sell orders', () => {
    const res = GlostenMilgromEngine.calculate({
      lowValue: 10.0,
      highValue: 20.0,
      priorProbabilityHigh: 0.5,
      informedFraction: 0.3,
      tradeSequence: [-1, -1, -1, -1, -1], // 5 consecutive sells
    });

    expect(res.finalBeliefProbability).toBeLessThan(0.15);
    expect(res.currentQuotes.midPrice).toBeLessThan(12.0);
  });

  it('validates parameter bounds and throws descriptive errors on invalid inputs', () => {
    expect(() =>
      GlostenMilgromEngine.calculate({
        lowValue: 100.0,
        highValue: 50.0,
        informedFraction: 0.2,
      })
    ).toThrow('lowValue must be strictly less than highValue');

    expect(() =>
      GlostenMilgromEngine.calculate({
        lowValue: 50.0,
        highValue: 100.0,
        informedFraction: 1.5,
      })
    ).toThrow('informedFraction must be within [0, 1]');

    expect(() =>
      GlostenMilgromEngine.calculate({
        lowValue: 50.0,
        highValue: 100.0,
        informedFraction: 0.2,
        priorProbabilityHigh: 1.0,
      })
    ).toThrow('priorProbabilityHigh must be strictly within (0, 1)');
  });
});
