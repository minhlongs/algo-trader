/**
 * Continuous Discovery Pipeline Adversarial Stress Tests
 *
 * Verifies end-to-end integration of candidate generation, walkforward evaluation,
 * survival gates, and diagnostic rejection under adversarial conditions.
 */

import { describe, it, expect } from 'vitest';
import { ContinuousDiscoveryPipeline } from '../../../../src/alpha-lab/alpha-discovery/continuous-discovery-pipeline';
import type { CandleLike } from '../../../../src/alpha-lab/regimes/regime-types';

describe('Continuous Discovery Pipeline Adversarial Stress Testing', () => {
  it('correctly rejects candidates in a whipsaw/bearish environment where cost stress collapses edge', async () => {
    // Generate oscillating whipsaw candles where momentum breakout incurs persistent slippage/losses
    const whipsawCandles: CandleLike[] = Array.from({ length: 200 }, (_, i) => {
      const isEven = i % 2 === 0;
      return {
        timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
        open: 100 + (isEven ? 1 : -1),
        high: 102,
        low: 98,
        close: 100 + (isEven ? -1 : 1),
        volume: 500,
      };
    });

    const pipeline = new ContinuousDiscoveryPipeline({
      candles: whipsawCandles,
      symbol: 'BTC/USDT',
      timeframe: '1h',
      familyIds: ['momentumBreakout'],
      sweep: { mode: 'defaults' },
    });

    const result = await pipeline.runCycle();
    expect(result.allCandidates).toHaveLength(1);
    const candidate = result.allCandidates[0]!;

    expect(candidate.status).toBe('REJECTED');
    expect(candidate.survivalGateResult.passed).toBe(false);
    expect(candidate.rejectionDiagnostics).toBeDefined();
    expect(candidate.rejectionDiagnostics!.length).toBeGreaterThan(0);

    for (const diag of candidate.rejectionDiagnostics!) {
      expect(diag.metric).toBeDefined();
      expect(typeof diag.value).toBe('number');
      expect(typeof diag.threshold).toBe('number');
      expect(Number.isFinite(diag.value)).toBe(true);
      expect(Number.isFinite(diag.threshold)).toBe(true);
      expect(diag.reason).toBeDefined();
      expect(diag.refinementHypothesis).toBeDefined();
    }
  });

  it('rejects candidate when survival gate criteria are tightened to extreme boundaries', async () => {
    // Upward candles normally pass with default criteria, but should fail with extreme hurdle (Sharpe >= 5.0)
    const upwardCandles: CandleLike[] = Array.from({ length: 150 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      open: 100 + i * 2,
      high: 100 + i * 2 + 1,
      low: 100 + i * 2 - 0.5,
      close: 100 + i * 2 + 1,
      volume: 1000,
    }));

    const pipeline = new ContinuousDiscoveryPipeline({
      candles: upwardCandles,
      symbol: 'BTC/USDT',
      timeframe: '1h',
      familyIds: ['momentumBreakout'],
      sweep: { mode: 'defaults' },
      survivalGates: {
        minOosSharpeRatio: 150.0, // Impossibly high hurdle (observed Sharpe is ~112.3)
      },
    });

    const result = await pipeline.runCycle();
    expect(result.allCandidates).toHaveLength(1);
    const candidate = result.allCandidates[0]!;

    expect(candidate.status).toBe('REJECTED');
    expect(candidate.survivalGateResult.passed).toBe(false);
    expect(candidate.survivalGateResult.checks.sharpePassed).toBe(false);

    const sharpeDiag = candidate.rejectionDiagnostics?.find((d) => d.metric === 'oos_sharpe_ratio');
    expect(sharpeDiag).toBeDefined();
    expect(sharpeDiag?.threshold).toBe(150.0);
    expect(sharpeDiag?.value).toBeLessThan(150.0);
  });
});
