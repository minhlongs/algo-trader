import { describe, expect, it } from 'vitest';
import { VarianceSwapReplicator } from '../../../../src/desk/gammaexotics/variance-swap-replicator';
import {
  CorridorSpec,
  VanillaOptionQuote,
  VarianceSwapSpec,
} from '../../../../src/desk/gammaexotics/variance-swap-types';

describe('Variance Swap, Corridor Variance & Gamma Swap Replication Suite (Demeterfi 1999) (Desk 98)', () => {
  const spec: VarianceSwapSpec = {
    underlyingSpot: 100.0,
    riskFreeRate: 0.05,
    dividendYield: 0.02,
    expiryYears: 1.0,
  };

  const sampleQuotes: VanillaOptionQuote[] = [
    { strike: 70, impliedVol: 0.28, isCall: false },
    { strike: 80, impliedVol: 0.25, isCall: false },
    { strike: 90, impliedVol: 0.22, isCall: false },
    { strike: 100, impliedVol: 0.20, isCall: true },
    { strike: 110, impliedVol: 0.19, isCall: true },
    { strike: 120, impliedVol: 0.19, isCall: true },
    { strike: 130, impliedVol: 0.20, isCall: true },
  ];

  it('should replicate fair variance strike and implied volatility strike consistently', () => {
    const result = VarianceSwapReplicator.replicateVarianceSwap(spec, sampleQuotes);

    expect(result.fairStrikeVariance).toBeGreaterThan(0.0);
    expect(result.fairVolatilityStrike).toBeGreaterThan(0.15);
    expect(result.fairVolatilityStrike).toBeLessThan(0.3);
    expect(result.putStripIntegral).toBeGreaterThan(0.0);
    expect(result.callStripIntegral).toBeGreaterThan(0.0);
  });

  it('should price vanilla Black-Scholes options correctly for calls and puts', () => {
    const call = VarianceSwapReplicator.blackScholes(100, 100, 0.05, 0.0, 0.2, 1.0, true);
    const put = VarianceSwapReplicator.blackScholes(100, 100, 0.05, 0.0, 0.2, 1.0, false);

    expect(call).toBeGreaterThan(0);
    expect(put).toBeGreaterThan(0);
    // Put-Call Parity: C - P = S - K * exp(-r*T)
    expect(call - put).toBeCloseTo(100 - 100 * Math.exp(-0.05), 4);
  });

  it('should replicate corridor variance swap within bounded strike range', () => {
    const corridor: CorridorSpec = {
      lowerBarrier: 80,
      upperBarrier: 120,
    };

    const corridorResult = VarianceSwapReplicator.replicateCorridorVariance(
      spec,
      sampleQuotes,
      corridor
    );

    expect(corridorResult.corridorVarianceFairStrike).toBeGreaterThan(0.0);
    // Bounded corridor captures a fraction of the total variance strip
    expect(corridorResult.corridorRatio).toBeGreaterThan(0.0);
  });

  it('should calculate Gamma Swap fair strike and convexity adjustment', () => {
    const gammaResult = VarianceSwapReplicator.evaluateGammaSwap(spec, sampleQuotes);

    expect(gammaResult.fairGammaStrike).toBeGreaterThan(0.0);
    expect(gammaResult.varianceSwapStrike).toBeGreaterThan(0.0);
    // Convexity adjustment reflects spot-weighted skew effect
    expect(typeof gammaResult.convexityAdjustment).toBe('number');
  });

  it('should throw an error when less than 2 quotes provided', () => {
    expect(() =>
      VarianceSwapReplicator.replicateVarianceSwap(spec, [sampleQuotes[0]!])
    ).toThrow('Variance swap replication requires at least 2 strike quotes');
  });
});
