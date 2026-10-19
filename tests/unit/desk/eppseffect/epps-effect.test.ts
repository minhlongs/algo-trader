import { describe, it, expect } from 'vitest';
import { EppsEffectEngine, EppsEffectMath, type TickRecord } from '../../../../src/desk/eppseffect';

describe('Epps (1979) Correlation Decay Suite', () => {
  function generateAsynchronousPair(n: number, trueLagMs: number): { ticksA: TickRecord[]; ticksB: TickRecord[] } {
    const ticksA: TickRecord[] = [];
    const ticksB: TickRecord[] = [];
    let priceA = 100;
    let priceB = 100;

    for (let i = 0; i < n; i++) {
      const tA = i * 200 + ((i * 37) % 50);
      const shock = Math.sin(i * 0.05) * 0.2 + (Math.cos(i * 0.1) * 0.1);
      priceA += shock;
      ticksA.push({ timestamp: tA, price: priceA });

      // Asset B reacts with lag trueLagMs and lower sampling frequency
      if (i % 2 === 0) {
        const tB = tA + trueLagMs + ((i * 19) % 30);
        priceB += shock * 0.95;
        ticksB.push({ timestamp: tB, price: priceB });
      }
    }
    return { ticksA, ticksB };
  }

  it('computes synchronized log returns and Pearson correlation correctly', () => {
    const returnsA = [0.01, -0.02, 0.03, 0.01, -0.01];
    const returnsB = [0.009, -0.018, 0.028, 0.011, -0.009];
    const corr = EppsEffectMath.pearsonCorrelation(returnsA, returnsB);
    expect(corr).toBeGreaterThan(0.95);
    expect(corr).toBeLessThanOrEqual(1.0);
  });

  it('reproduces empirical Epps correlation decay at ultra-high frequencies', () => {
    const { ticksA, ticksB } = generateAsynchronousPair(300, 1000);
    const engine = new EppsEffectEngine();
    const intervals = [100, 300, 1000, 3000, 10000];
    const decay = engine.computeDecayCurve(ticksA, ticksB, intervals);

    expect(decay.points.length).toBe(intervals.length);
    // Correlation at 100ms should be lower than at 10,000ms due to asynchronous timestamp noise
    const fineCorr = decay.points[0]!.correlation;
    const coarseCorr = decay.points[decay.points.length - 1]!.correlation;

    expect(coarseCorr).toBeGreaterThan(fineCorr);
    expect(decay.asymptoticCorrelation).toBeGreaterThan(0);
    expect(decay.tauDecayMs).toBeGreaterThan(0);
  });

  it('detects lead-lag offset accurately via cross-correlation peak', () => {
    const targetLagMs = 1000;
    const { ticksA, ticksB } = generateAsynchronousPair(300, targetLagMs);
    const engine = new EppsEffectEngine();
    const lags = [-2000, -1000, 0, 1000, 2000];
    const leadLag = engine.estimateLeadLag(ticksA, ticksB, lags, 500);

    // Asset A leads Asset B by ~1000ms
    expect(leadLag.optimalLagMs).toBe(targetLagMs);
    expect(leadLag.peakCorrelation).toBeGreaterThan(leadLag.zeroLagCorrelation);
    expect(leadLag.asymmetryRatio).toBeGreaterThan(1.0);
  });

  it('validates minimum tick length and throws descriptive error', () => {
    const engine = new EppsEffectEngine();
    const shortTicks = [{ timestamp: 100, price: 10 }];
    expect(() => engine.analyze('A', shortTicks, 'B', shortTicks)).toThrow('Insufficient ticks');
  });
});
