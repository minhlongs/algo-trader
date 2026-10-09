import { describe, it, expect } from 'vitest';
import {
  DermanKaniEngine,
  buildDermanKaniTree,
  blackScholesPrice,
  normalCdf,
} from '../../../../src/desk/dermankani';

describe('Derman-Kani (1994) Implied Volatility Local Tree Suite', () => {
  const spot = 100;
  const rate = 0.05;
  const dividendYield = 0.01;
  const timeToMaturity = 1.0;
  const steps = 10;

  // Linear skew / smile profile: sigma(K) = 0.20 - 0.10 * (K - S)/S + 0.15 * ((K - S)/S)^2
  const smileVolFn = (strike: number, _t: number): number => {
    const m = (strike - spot) / spot;
    return Math.max(0.05, 0.2 - 0.1 * m + 0.15 * m * m);
  };

  it('calculates Black-Scholes benchmark prices and normal CDF correctly', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 2);

    const callAtm = blackScholesPrice(100, 100, 1.0, 0.05, 0.0, 0.2, 'call');
    const putAtm = blackScholesPrice(100, 100, 1.0, 0.05, 0.0, 0.2, 'put');

    // Put-Call Parity: C - P = S - K * exp(-r*T)
    const parityDiff = callAtm - putAtm - (100 - 100 * Math.exp(-0.05 * 1.0));
    expect(parityDiff).toBeCloseTo(0, 4);
  });

  it('calibrates implied binomial tree with positive Arrow-Debreu prices', () => {
    const tree = buildDermanKaniTree({
      spot,
      rate,
      dividendYield,
      timeToMaturity,
      steps,
      impliedVolFn: smileVolFn,
    });

    expect(tree.steps).toBe(10);
    expect(tree.nodes.length).toBe(11); // step 0 to step 10

    // Root node Arrow-Debreu price is 1.0
    expect(tree.nodes[0][0].arrowDebreuPrice).toBe(1.0);
    expect(tree.nodes[0][0].stockPrice).toBe(100);

    // Later steps have non-negative state prices summing to discount factor
    for (let i = 1; i <= steps; i++) {
      const statePriceSum = tree.nodes[i].reduce((sum, n) => sum + n.arrowDebreuPrice, 0);
      const expectedDiscount = Math.exp(-rate * (i * tree.dt));
      expect(statePriceSum).toBeCloseTo(expectedDiscount, 2);

      // Transition probabilities should be strictly in (0, 1)
      for (const node of tree.nodes[i - 1]) {
        expect(node.transitionProbUp).toBeGreaterThan(0);
        expect(node.transitionProbUp).toBeLessThan(1);
      }
    }
  });

  it('prices European call & put options with consistent Greeks', () => {
    const engine = new DermanKaniEngine({
      spot,
      rate,
      dividendYield,
      timeToMaturity,
      steps: 12,
      impliedVolFn: smileVolFn,
    });

    const callResult = engine.price({
      optionType: 'call',
      exerciseStyle: 'european',
      strike: 100,
    });

    expect(callResult.price).toBeGreaterThan(0);
    expect(callResult.delta).toBeGreaterThan(0.4);
    expect(callResult.delta).toBeLessThan(0.7);
    expect(callResult.gamma).toBeGreaterThan(0);
    expect(callResult.earlyExercisePremium).toBe(0);

    const putResult = engine.price({
      optionType: 'put',
      exerciseStyle: 'european',
      strike: 100,
    });

    expect(putResult.price).toBeGreaterThan(0);
    expect(putResult.delta).toBeLessThan(0);
    expect(putResult.earlyExercisePremium).toBe(0);
  });

  it('correctly models American early exercise premium on dividend-paying assets', () => {
    const engine = new DermanKaniEngine({
      spot: 100,
      rate: 0.02,
      dividendYield: 0.08, // High dividend favors early call exercise
      timeToMaturity: 1.0,
      steps: 10,
      impliedVolFn: smileVolFn,
    });

    const americanCall = engine.price({
      optionType: 'call',
      exerciseStyle: 'american',
      strike: 80, // Deep in the money call
    });

    expect(americanCall.earlyExercisePremium).toBeGreaterThanOrEqual(0);
    expect(americanCall.price).toBeGreaterThanOrEqual(100 - 80); // American ITM >= intrinsic
  });

  it('extracts local volatility profile along tree steps', () => {
    const engine = new DermanKaniEngine({
      spot,
      rate,
      dividendYield,
      timeToMaturity,
      steps: 8,
      impliedVolFn: smileVolFn,
    });

    const profile = engine.getLocalVolProfile(4);
    expect(profile.length).toBe(5); // step 4 has 5 nodes
    for (const pt of profile) {
      expect(pt.strike).toBeGreaterThan(0);
      expect(pt.localVol).toBeGreaterThan(0);
    }
  });
});
