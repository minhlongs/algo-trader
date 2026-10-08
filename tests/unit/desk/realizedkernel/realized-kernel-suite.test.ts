import { describe, expect, it } from 'vitest';
import { KernelWeights } from '../../../../src/desk/realizedkernel/kernel-weights';
import { RealizedKernelEngine } from '../../../../src/desk/realizedkernel/realized-kernel-engine';

describe('RealizedKernelEngine Suite (Desk 85)', () => {
  const engine = new RealizedKernelEngine();

  // Synthetic price path with microstructure noise (bid-ask bounce)
  const generateNoisyLogPrices = (n: number, trueVol: number): number[] => {
    const prices: number[] = [Math.log(100.0)];
    let state = 98765;
    const dt = 1.0 / (252.0 * 390.0); // 1-minute frequency

    for (let i = 1; i < n; i++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      const u1 = Math.max(1e-7, (state % 10000) / 10000.0);
      state = (state * 1664525 + 1013904223) % 4294967296;
      const u2 = (state % 10000) / 10000.0;
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

      const trueStep = trueVol * Math.sqrt(dt) * z;
      const noise = ((state % 100) - 50) / 50000.0; // Microstructure noise
      prices.push(prices[i - 1]! + trueStep + noise);
    }
    return prices;
  };

  it('should verify Parzen and Modified Tukey-Hanning kernel weights', () => {
    expect(KernelWeights.weight('PARZEN', 0.0)).toBe(1.0);
    expect(KernelWeights.weight('PARZEN', 1.0)).toBe(0.0);
    expect(KernelWeights.weight('PARZEN', 0.5)).toBeGreaterThan(0.0);

    expect(KernelWeights.weight('MODIFIED_TUKEY_HANNING', 0.0)).toBeCloseTo(1.0, 4);
    expect(KernelWeights.weight('MODIFIED_TUKEY_HANNING', 1.0)).toBeCloseTo(0.0, 4);
  });

  it('should estimate realized kernel variance and optimal bandwidth', () => {
    const prices = generateNoisyLogPrices(200, 0.2);
    const result = engine.estimateVolatility(prices, { kernelType: 'PARZEN' });

    expect(result.sampleCount).toBe(200);
    expect(result.realizedKernelVariance).toBeGreaterThan(0.0);
    expect(result.annualizedVolatilityPct).toBeGreaterThan(0.0);
    expect(result.optimalBandwidthH).toBeGreaterThanOrEqual(1);
    expect(result.standardRealizedVariance).toBeGreaterThan(0.0);
    expect(result.noiseVarianceEstimate).toBeGreaterThan(0.0);
  });

  it('should throw error when sample observations are insufficient (< 10)', () => {
    const fewPrices = [1.0, 1.01, 1.02];
    expect(() => engine.estimateVolatility(fewPrices)).toThrow(
      'At least 10 price observations required for Realized Kernel'
    );
  });
});
