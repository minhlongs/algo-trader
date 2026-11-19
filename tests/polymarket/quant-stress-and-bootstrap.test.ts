import { describe, expect, it } from 'vitest';
import {
  computeDeflatedSharpeRatio,
  runNineScenarioStressSuite,
  stationaryBlockBootstrapCI,
  type StressScenarioId,
} from '../../src/desk/polymarket/quant-stress-and-bootstrap';

describe('stationaryBlockBootstrapCI', () => {
  it('is deterministic for a fixed seed and produces a valid 95% CI bracketing the mean', () => {
    const samples = [12, 18, 9, 15, 22, 14, 19, 11, 16, 20, 13, 17, 21, 10, 15];
    const a = stationaryBlockBootstrapCI(samples, { iterations: 500, avgBlockLength: 4, seed: 1337 });
    const b = stationaryBlockBootstrapCI(samples, { iterations: 500, avgBlockLength: 4, seed: 1337 });

    expect(a).toEqual(b);
    expect(a.lower).toBeGreaterThan(0);
    expect(a.lower).toBeLessThanOrEqual(a.mean);
    expect(a.mean).toBeLessThanOrEqual(a.upper);
  });

  it('handles empty samples safely', () => {
    const res = stationaryBlockBootstrapCI([], { seed: 7 });
    expect(res.mean).toBe(0);
    expect(res.lower).toBe(0);
    expect(res.upper).toBe(0);
  });
});

describe('computeDeflatedSharpeRatio', () => {
  it('penalizes higher trial counts (multiple testing deflation)', () => {
    const returns = Array.from({ length: 120 }, (_, i) => (i % 5 === 0 ? -0.004 : 0.006));
    const lowTrials = computeDeflatedSharpeRatio({ returns, nTrials: 1, periodsPerYear: 252 });
    const highTrials = computeDeflatedSharpeRatio({ returns, nTrials: 200, periodsPerYear: 252 });

    expect(lowTrials.observedSharpe).toBeGreaterThan(0);
    expect(lowTrials.observedSharpe).toBe(highTrials.observedSharpe);
    expect(highTrials.expectedMaxSharpe).toBeGreaterThan(lowTrials.expectedMaxSharpe);
    expect(highTrials.deflatedSharpeProb).toBeLessThanOrEqual(lowTrials.deflatedSharpeProb);
    expect(lowTrials.sampleLength).toBe(120);
  });

  it('returns zeroed metrics for degenerate short series', () => {
    const res = computeDeflatedSharpeRatio({ returns: [0.01, 0.02], nTrials: 10 });
    expect(res.observedSharpe).toBe(0);
    expect(res.deflatedSharpeProb).toBe(0);
  });
});

describe('runNineScenarioStressSuite', () => {
  const EXPECTED_SCENARIOS: StressScenarioId[] = [
    'SLIPPAGE_1_5X',
    'CANCEL_LATENCY_1_5X',
    'LIQUIDITY_REWARDS_MINUS_50PCT',
    'ADVERSE_HALF_TICK',
    'STALE_FEED_GT_1500MS',
    'HTTP_425_ENGINE_RESTART',
    'GHOST_FILL_STATUS_ZERO',
    'UMA_DISPUTE_GT_10PCT_NAV',
    'FIVE_MIN_CRYPTO_EXCLUSION',
  ];

  it('evaluates all 9 canonical scenarios and passes when economic margin & guards hold', () => {
    const report = runNineScenarioStressSuite({
      baselineNetPnlPusd: 500,
      baselineSlippagePusd: 80,
      baselineStaleAdverseFillCostPusd: 60,
      baselineLiquidityRewardsPusd: 120,
      fillCount: 100,
      avgFillShares: 20,
      tickSizePusd: 0.01,
    });

    expect(report.totalCount).toBe(9);
    expect(report.scenarios.map((s) => s.scenarioId)).toEqual(EXPECTED_SCENARIOS);
    expect(report.allPassed).toBe(true);
    expect(report.passedCount).toBe(9);

    const ghost = report.scenarios.find((s) => s.scenarioId === 'GHOST_FILL_STATUS_ZERO')!;
    expect(ghost.observedAction).toBe('KILL_SWITCH_FIRED_0_UNGUARDED');

    const http425 = report.scenarios.find((s) => s.scenarioId === 'HTTP_425_ENGINE_RESTART')!;
    expect(http425.observedAction).toBe('POST_ONLY_COOLDOWN_120S');

    const uma = report.scenarios.find((s) => s.scenarioId === 'UMA_DISPUTE_GT_10PCT_NAV')!;
    expect(uma.observedAction).toBe('UMA_DISPUTE_LOCKUP_HALT');

    const fiveMin = report.scenarios.find((s) => s.scenarioId === 'FIVE_MIN_CRYPTO_EXCLUSION')!;
    expect(fiveMin.observedAction).toBe('HARD_REJECT');
  });

  it('fails economic stress scenarios when baseline PnL cannot absorb shocks', () => {
    const report = runNineScenarioStressSuite({
      baselineNetPnlPusd: 30,
      baselineSlippagePusd: 100,
      baselineStaleAdverseFillCostPusd: 90,
      baselineLiquidityRewardsPusd: 120,
      fillCount: 500,
      avgFillShares: 25,
    });

    expect(report.allPassed).toBe(false);
    const economic = report.scenarios.filter((s) => s.category === 'economic');
    expect(economic.every((s) => !s.passed)).toBe(true);
    // Operational fail-closed guards still pass
    const guards = report.scenarios.filter((s) => s.category === 'operational_guard');
    expect(guards.every((s) => s.passed)).toBe(true);
  });
});
