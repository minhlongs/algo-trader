import { describe, it, expect } from 'vitest';
import { EkopEngine } from '../../../../src/desk/ekop/ekop-engine.js';
import { EkopParameters, DailyTradeCount } from '../../../../src/desk/ekop/ekop-types.js';

describe('Easley-Kiefer-O\'Hara-Paperman (1996) EKOP Structural Microstructure Engine', () => {
  const baseParams: EkopParameters = {
    alpha: 0.35,
    delta: 0.40,
    mu: 50,
    epsilon: 25,
  };

  const sampleDays: DailyTradeCount[] = [
    { buys: 26, sells: 24 }, // Typical no event
    { buys: 78, sells: 25 }, // Good news day
    { buys: 23, sells: 74 }, // Bad news day
    { buys: 28, sells: 27 }, // No event
  ];

  it('calculates analytical PIN strictly in [0, 1] bounded by theoretical formula', () => {
    const res = EkopEngine.analyze(sampleDays, baseParams);
    const expectedPin = (0.35 * 50) / (0.35 * 50 + 2 * 25);
    expect(res.pin).toBeCloseTo(expectedPin, 6);
    expect(res.pin).toBeGreaterThan(0.2);
    expect(res.pin).toBeLessThan(0.3);
  });

  it('classifies information events into distinct states based on posterior probabilities', () => {
    const res = EkopEngine.analyze(sampleDays, baseParams);
    expect(res.posteriors.length).toBe(4);
    expect(res.posteriors[0].classifiedState).toBe('NO_EVENT');
    expect(res.posteriors[1].classifiedState).toBe('GOOD_NEWS');
    expect(res.posteriors[2].classifiedState).toBe('BAD_NEWS');
    expect(res.posteriors[3].classifiedState).toBe('NO_EVENT');

    expect(res.posteriors[1].probGoodNews).toBeGreaterThan(0.9);
    expect(res.posteriors[2].probBadNews).toBeGreaterThan(0.9);
  });

  it('scales adverse selection spread proportionally with PIN', () => {
    const lowInfoParams: EkopParameters = { ...baseParams, alpha: 0.1, mu: 10 };
    const highInfoParams: EkopParameters = { ...baseParams, alpha: 0.8, mu: 80 };

    const lowRes = EkopEngine.analyze(sampleDays, lowInfoParams, 2.0);
    const highRes = EkopEngine.analyze(sampleDays, highInfoParams, 2.0);

    expect(highRes.pin).toBeGreaterThan(lowRes.pin);
    expect(highRes.adverseSelectionSpread).toBeGreaterThan(lowRes.adverseSelectionSpread);
  });

  it('estimates initial parameters from empirical daily trade moments', () => {
    const estimated = EkopEngine.estimateMoments(sampleDays);
    expect(estimated.alpha).toBeGreaterThan(0);
    expect(estimated.mu).toBeGreaterThan(0);
    expect(estimated.epsilon).toBeGreaterThan(0);
  });

  it('strictly validates boundaries and rejects illegal parameters', () => {
    expect(() => EkopEngine.analyze(sampleDays, { ...baseParams, alpha: 1.5 })).toThrow(/\[0, 1\]/);
    expect(() => EkopEngine.analyze(sampleDays, { ...baseParams, delta: -0.1 })).toThrow(/\[0, 1\]/);
    expect(() => EkopEngine.analyze(sampleDays, { ...baseParams, mu: 0 })).toThrow(/strictly positive/);
    expect(() => EkopEngine.analyze(sampleDays, { ...baseParams, epsilon: -5 })).toThrow(/strictly positive/);
    expect(() => EkopEngine.analyze([], baseParams)).toThrow(/empty/);
  });
});
