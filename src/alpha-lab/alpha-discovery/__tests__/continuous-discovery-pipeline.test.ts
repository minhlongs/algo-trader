import { describe, it, expect } from 'vitest';
import { ContinuousDiscoveryPipeline } from '../continuous-discovery-pipeline';
import { generateMultiRegimeCandles } from '../../experiments/multi-regime-candle-generator';

describe('Continuous Discovery Pipeline', () => {
  const candles = generateMultiRegimeCandles();

  it('runs an autonomous discovery cycle and emits DiscoveredAlphaCandidate[] conforming to PROJECT.md contract', async () => {
    const pipeline = new ContinuousDiscoveryPipeline({
      candles,
      symbol: 'BTC/USDT',
      timeframe: '1h',
      sweep: { mode: 'defaults' },
    });

    const result = await pipeline.runCycle();

    expect(result.summary.totalEvaluated).toBe(4);
    expect(result.summary.passedCount + result.summary.rejectedCount).toBe(4);
    expect(result.summary.familiesEvaluated).toHaveLength(4);
    expect(result.summary.durationMs).toBeGreaterThan(0);
    expect(result.allCandidates).toHaveLength(4);

    for (const cand of result.allCandidates) {
      // Contract verification (PROJECT.md lines 75-92)
      expect(typeof cand.strategyId).toBe('string');
      expect(typeof cand.familyId).toBe('string');
      expect(cand.config).toBeDefined();
      expect(cand.walkforwardSummary).toBeDefined();
      expect(cand.survivalGateResult).toBeDefined();
      expect(['PASSED', 'REJECTED']).toContain(cand.status);

      if (cand.status === 'REJECTED') {
        expect(cand.survivalGateResult.passed).toBe(false);
        expect(cand.rejectionDiagnostics).toBeDefined();
        expect(cand.rejectionDiagnostics!.length).toBeGreaterThan(0);
        for (const diag of cand.rejectionDiagnostics!) {
          expect(typeof diag.metric).toBe('string');
          expect(typeof diag.value).toBe('number');
          expect(typeof diag.threshold).toBe('number');
          expect(typeof diag.reason).toBe('string');
          expect(typeof diag.refinementHypothesis).toBe('string');
        }
      } else {
        expect(cand.survivalGateResult.passed).toBe(true);
        expect(cand.rejectionDiagnostics).toBeUndefined();
      }
    }
  });

  it('filters discovery cycle by specific strategy families', async () => {
    const pipeline = new ContinuousDiscoveryPipeline({
      candles,
      symbol: 'ETH/USDT',
      timeframe: '1h',
      familyIds: ['trendFollowing', 'meanReversion'],
      sweep: { mode: 'defaults' },
    });

    const result = await pipeline.runCycle();

    expect(result.summary.totalEvaluated).toBe(2);
    const familyIds = result.allCandidates.map((c) => c.familyId);
    expect(familyIds).toEqual(['trend-following', 'mean-reversion']);
  });

  it('supports bounded grid and random parameter sweep modes', async () => {
    const pipeline = new ContinuousDiscoveryPipeline({
      candles,
      symbol: 'BTC/USDT',
      timeframe: '1h',
      familyIds: ['momentumBreakout'],
      sweep: {
        mode: 'random',
        maxCandidatesPerFamily: 3,
        seed: 42,
      },
    });

    const result = await pipeline.runCycle();

    expect(result.allCandidates).toHaveLength(3);
    const candidateIds = result.allCandidates.map((c) => c.strategyId);
    expect(new Set(candidateIds).size).toBe(3);
  });

  it('emits PASSED status for a genuinely profitable candidate strategy meeting all survival gates', async () => {
    // Generate trending upward candles where breakout strategy achieves high win rate, high Sharpe, and low drawdown
    const upwardCandles = Array.from({ length: 150 }, (_, i) => ({
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
    });

    const result = await pipeline.runCycle();
    expect(result.allCandidates).toHaveLength(1);
    expect(result.allCandidates[0]!.status).toBe('PASSED');
    expect(result.passedCandidates).toHaveLength(1);
    expect(result.rejectedCandidates).toHaveLength(0);
    expect(result.allCandidates[0]!.survivalGateResult.passed).toBe(true);
    expect(result.allCandidates[0]!.rejectionDiagnostics).toBeUndefined();
  });
});
