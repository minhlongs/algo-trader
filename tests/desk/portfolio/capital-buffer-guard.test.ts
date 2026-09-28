import { describe, it, expect } from 'vitest';
import { CapitalBufferGuard } from '../../../src/desk/portfolio/capital-buffer-guard';
import { ENGINE_IDS, EngineId } from '../../../src/desk/portfolio/types';

describe('Capital Buffer Guard & Starvation Lock Protection', () => {
  it('guarantees min 20% unallocated liquid cash buffer on baseline allocation', () => {
    const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
    const totalNavUsd = 100000;
    const targetWeights: Record<EngineId, number> = {
      arbitrage: 0.25,
      marl: 0.25,
      amm: 0.25,
      'alpha-lab': 0.25,
    };
    const lockedCapital: Record<EngineId, number> = {
      arbitrage: 5000,
      marl: 5000,
      amm: 5000,
      'alpha-lab': 5000,
    };

    const result = guard.applyGuard(totalNavUsd, targetWeights, lockedCapital);

    // Unallocated cash must be at least 20% of NAV ($20,000)
    expect(result.unallocatedCashUsd).toBeCloseTo(20000, 2);
    expect(result.cashBufferRatio).toBeGreaterThanOrEqual(0.20);

    // Total allocated capital must be exactly 80% ($80,000)
    const sumAllocated = ENGINE_IDS.reduce((sum, id) => sum + result.allocatedCapitalUsd[id], 0);
    expect(sumAllocated).toBeCloseTo(80000, 2);

    // Each engine gets $20,000
    for (const id of ENGINE_IDS) {
      expect(result.allocatedCapitalUsd[id]).toBeCloseTo(20000, 2);
    }
    expect(result.drainModeEngines.length).toBe(0);
  });

  it('prevents starvation by clamping allocation to locked capital and flagging drain mode', () => {
    const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
    const totalNavUsd = 100000; // deployable = 80,000
    // Ideal target for marl is 0.10 * 80,000 = $8,000
    const targetWeights: Record<EngineId, number> = {
      arbitrage: 0.40,
      marl: 0.10,
      amm: 0.25,
      'alpha-lab': 0.25,
    };
    // But marl has $15,000 locked in open quotes
    const lockedCapital: Record<EngineId, number> = {
      arbitrage: 5000,
      marl: 15000,
      amm: 5000,
      'alpha-lab': 5000,
    };

    const result = guard.applyGuard(totalNavUsd, targetWeights, lockedCapital);

    // Marl allocation clamped to at least locked capital ($15,000)
    expect(result.allocatedCapitalUsd.marl).toBeGreaterThanOrEqual(15000);
    expect(result.drainModeEngines).toContain('marl');

    // Remaining deployable ($80,000 - $15,000 = $65,000) distributed to other 3 engines
    const sumNonMarl =
      result.allocatedCapitalUsd.arbitrage +
      result.allocatedCapitalUsd.amm +
      result.allocatedCapitalUsd['alpha-lab'];
    expect(sumNonMarl).toBeCloseTo(65000, 2);

    // All engines satisfy their locked capital
    for (const id of ENGINE_IDS) {
      expect(result.allocatedCapitalUsd[id]).toBeGreaterThanOrEqual(lockedCapital[id]);
    }

    // Cash buffer remains 20%
    expect(result.unallocatedCashUsd).toBeCloseTo(20000, 2);
  });

  it('filters rebalancing via 3% deadband', () => {
    const guard = new CapitalBufferGuard({ rebalanceDeadband: 0.03 });
    const current: Record<EngineId, number> = {
      arbitrage: 20000,
      marl: 20000,
      amm: 20000,
      'alpha-lab': 20000,
    };

    // 1% drift (< 3% threshold)
    const smallDrift: Record<EngineId, number> = {
      arbitrage: 20200, // +1%
      marl: 19800, // -1%
      amm: 20100,
      'alpha-lab': 19900,
    };
    const check1 = guard.checkDeadband(smallDrift, current);
    expect(check1.shouldRebalance).toBe(false);
    expect(check1.maxDriftPct).toBeLessThan(0.03);

    // 5% drift (>= 3% threshold)
    const largeDrift: Record<EngineId, number> = {
      arbitrage: 21000, // +5%
      marl: 19000, // -5%
      amm: 20000,
      'alpha-lab': 20000,
    };
    const check2 = guard.checkDeadband(largeDrift, current);
    expect(check2.shouldRebalance).toBe(true);
    expect(check2.maxDriftPct).toBeGreaterThanOrEqual(0.03);
  });

  it('enforces 15-minute rebalance cooldown period', () => {
    const guard = new CapitalBufferGuard({ cooldownPeriodMs: 15 * 60 * 1000 });
    const t0 = 1000000000000;

    // First rebalance is always allowed
    expect(guard.checkCooldown(t0)).toBe(true);
    guard.recordRebalance(t0);

    // 5 minutes later: blocked
    expect(guard.checkCooldown(t0 + 5 * 60 * 1000)).toBe(false);

    // 14 minutes later: blocked
    expect(guard.checkCooldown(t0 + 14 * 60 * 1000)).toBe(false);

    // 15 minutes later: allowed
    expect(guard.checkCooldown(t0 + 15 * 60 * 1000)).toBe(true);
  });
});
