import { describe, it, expect } from 'vitest';
import {
  CarrMadanEngine,
  CarrMadanMath,
  PayoffSpecification,
} from '../../../../src/desk/carrmadan';

describe('Carr-Madan (1998) Static Replication Suite', () => {
  const market = {
    spot: 100,
    rate: 0.05,
    dividendYield: 0.02,
    volatility: 0.2,
    timeToMaturity: 1.0,
  };

  it('verifies put-call symmetry exact boundary reflection parity at S = H', () => {
    const H = 90;
    const K = 105;
    const Kprime = CarrMadanMath.computeReflectedStrike(H, K);
    expect(Kprime).toBeCloseTo((90 * 90) / 105, 6);

    const callAtH = CarrMadanMath.blackScholesPrice(H, K, market.timeToMaturity, market.volatility, market.rate, market.dividendYield, 'call');
    const putAtHSwapped = CarrMadanMath.blackScholesPrice(H, Kprime, market.timeToMaturity, market.volatility, market.dividendYield, market.rate, 'put');
    const weight = K / H;

    expect(Math.abs(callAtH - weight * putAtHSwapped)).toBeLessThan(1e-10);
  });

  it('replicates down-and-out call option with zero boundary error', () => {
    const engine = new CarrMadanEngine();
    const res = engine.replicateBarrierOption({
      barrier: 85,
      strike: 100,
      barrierType: 'down-and-out-call',
      market,
    });

    expect(res.paritySatisfied).toBe(true);
    expect(res.boundaryErrorAtBarrier).toBeLessThan(1e-6);
    expect(res.replicatedPrice).toBeGreaterThan(0);
    expect(res.replicatedPrice).toBeLessThan(res.vanillaOption.price);
  });

  it('replicates log-contract variance swap payoff via Carr-Madan spanning identity', () => {
    const engine = new CarrMadanEngine();
    const Sstar = 100;
    const logPayoff: PayoffSpecification = {
      f: (s: number) => -2 * Math.log(s / Sstar),
      fPrime: (s: number) => -2 / s,
      fDoublePrime: (s: number) => 2 / (s * s),
    };

    const strikes: number[] = [];
    for (let k = 20; k <= 250; k += 2) {
      strikes.push(k);
    }

    const result = engine.replicatePayoff({
      referencePrice: Sstar,
      strikes,
      payoff: logPayoff,
      market,
    });

    expect(result.bondWeight).toBeCloseTo(2.0, 6);
    expect(result.underlyingWeight).toBeCloseTo(-0.02, 6);
    expect(result.integralPutsValue).toBeGreaterThan(0);
    expect(result.integralCallsValue).toBeGreaterThan(0);

    // Theoretical analytical expectation under Black-Scholes:
    // E^Q[-2 ln(S_T/S_*)] * e^{-rT} = -2 * (r - q - 0.5 * sigma^2) * T * e^{-rT}
    const drift = market.rate - market.dividendYield - 0.5 * market.volatility * market.volatility;
    const expectedDiscounted = Math.exp(-market.rate * market.timeToMaturity) * (-2 * drift * market.timeToMaturity);
    expect(Math.abs(result.replicatedPrice - expectedDiscounted)).toBeLessThan(0.005);
  });

  it('replicates quadratic payoff (S_T - S_*)^2 accurately', () => {
    const engine = new CarrMadanEngine();
    const Sstar = 100;
    const quadPayoff: PayoffSpecification = {
      f: (s: number) => Math.pow(s - Sstar, 2),
      fPrime: (s: number) => 2 * (s - Sstar),
      fDoublePrime: () => 2.0,
    };

    const strikes: number[] = [];
    for (let k = 30; k <= 200; k += 1) {
      strikes.push(k);
    }

    const result = engine.replicatePayoff({
      referencePrice: Sstar,
      strikes,
      payoff: quadPayoff,
      market,
    });

    expect(result.bondWeight).toBeCloseTo(0, 6);
    expect(result.underlyingWeight).toBeCloseTo(0, 6);
    expect(result.integralPutsValue).toBeGreaterThan(0);
    expect(result.integralCallsValue).toBeGreaterThan(0);
    expect(result.replicatedPrice).toBeGreaterThan(0);
  });

  it('stabilizes discrete strike weights with Tikhonov regularization', () => {
    const strikes = [90, 91, 92, 95, 100, 105, 110];
    const evaluator = (k: number) => 1000 / (k * k);

    const unregWeights = CarrMadanMath.computeDiscreteWeights(strikes, evaluator, 0);
    const regWeights = CarrMadanMath.computeDiscreteWeights(strikes, evaluator, 0.5);

    expect(unregWeights.length).toBe(strikes.length);
    expect(regWeights.length).toBe(strikes.length);
    expect(regWeights[0]!.weight).toBeLessThan(unregWeights[0]!.weight);
  });

  it('handles edge cases and invalid parameters robustly', () => {
    const engine = new CarrMadanEngine();
    expect(() => CarrMadanMath.computeReflectedStrike(100, 0)).toThrow();
    expect(() =>
      engine.replicateBarrierOption({
        barrier: -10,
        strike: 100,
        barrierType: 'down-and-out-call',
        market,
      }),
    ).toThrow();
  });
});
