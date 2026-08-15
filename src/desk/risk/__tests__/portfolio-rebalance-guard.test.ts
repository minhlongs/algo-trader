/**
 * PortfolioRebalanceGuard unit tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PortfolioRebalanceGuard } from '../portfolio-rebalance-guard';
import type { AllocationTarget, PositionSnapshot } from '../portfolio-rebalance-guard';

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTargets(pcts: number[]): AllocationTarget[] {
  const tokens = ['tok-a', 'tok-b', 'tok-c', 'tok-d'];
  return pcts.map((pct, i) => ({ tokenId: tokens[i], targetPct: pct }));
}

function makePositions(usdcs: number[]): PositionSnapshot[] {
  const tokens = ['tok-a', 'tok-b', 'tok-c', 'tok-d'];
  return usdcs.map((sizeUsdc, i) => ({ tokenId: tokens[i], sizeUsdc }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PortfolioRebalanceGuard', () => {
  let guard: PortfolioRebalanceGuard;

  beforeEach(() => {
    guard = new PortfolioRebalanceGuard({ maxDriftPct: 0.05, rebalanceCooldownMs: 60_000, maxDailyRebalances: 3 });
  });

  it('allows rebalance when no targets set', () => {
    const result = guard.check([]);
    expect(result.allowed).toBe(true);
    expect(result.status.needsRebalance).toBe(false);
  });

  it('detects drift when positions deviate from targets', () => {
    // Targets: 25% each. tok-a has 40% (drift = 0.15)
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const positions = makePositions([400, 200, 200, 200]);
    const result = guard.check(positions);

    expect(result.status.needsRebalance).toBe(true);
    expect(result.status.drift).toBeCloseTo(0.15, 4);
    expect(result.status.driftedPositions.length).toBe(1);
    expect(result.status.driftedPositions[0].tokenId).toBe('tok-a');
  });

  it('allows rebalance when within drift bounds', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const positions = makePositions([260, 250, 240, 250]);
    const result = guard.check(positions);

    expect(result.status.needsRebalance).toBe(false);
    expect(result.status.drift).toBeLessThan(0.05);
  });

  it('rejects rebalance during cooldown period', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const drifted = makePositions([500, 100, 200, 200]);

    // First check — allowed
    const first = guard.check(drifted);
    expect(first.allowed).toBe(true);

    // Record rebalance, then check again — cooldown active
    guard.recordRebalance();
    const second = guard.check(drifted);
    expect(second.allowed).toBe(false);
    expect(second.reason).toContain('cooldown');
  });

  it('allows rebalance after cooldown expires', () => {
    // Use very short cooldown for test
    const shortGuard = new PortfolioRebalanceGuard({ rebalanceCooldownMs: 1 });
    shortGuard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const drifted = makePositions([500, 100, 200, 200]);

    shortGuard.recordRebalance();

    // Wait for cooldown
    return new Promise(r => setTimeout(r, 5)).then(() => {
      const result = shortGuard.check(drifted);
      expect(result.allowed).toBe(true);
    });
  });

  it('rejects rebalance when daily limit reached', () => {
    const limitGuard = new PortfolioRebalanceGuard({ maxDailyRebalances: 2, rebalanceCooldownMs: 1 });
    limitGuard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const drifted = makePositions([500, 100, 200, 200]);

    limitGuard.recordRebalance();
    limitGuard.recordRebalance();

    return new Promise(r => setTimeout(r, 5)).then(() => {
      const result = limitGuard.check(drifted);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily rebalance limit');
    });
  });

  it('tracks rebalancesToday count', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const drifted = makePositions([500, 100, 200, 200]);

    guard.recordRebalance();
    guard.recordRebalance();
    const status = guard.getStatus(drifted);
    expect(status.rebalancesToday).toBe(2);
  });

  it('resetDaily clears counter and cooldown', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const drifted = makePositions([500, 100, 200, 200]);

    guard.recordRebalance();
    guard.resetDaily();

    const result = guard.check(drifted);
    expect(result.allowed).toBe(true);
    expect(result.status.rebalancesToday).toBe(0);
  });

  it('handles positions with zero total (empty portfolio)', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const result = guard.check([]);
    expect(result.status.needsRebalance).toBe(false);
    expect(result.status.drift).toBe(0);
  });

  it('handles partial positions (some tokens not held)', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    // Only holding tok-a (50%) and tok-b (50%), missing tok-c and tok-d
    const positions: PositionSnapshot[] = [
      { tokenId: 'tok-a', sizeUsdc: 500 },
      { tokenId: 'tok-b', sizeUsdc: 500 },
    ];
    const result = guard.check(positions);
    expect(result.status.needsRebalance).toBe(true);
    expect(result.status.driftedPositions.length).toBeGreaterThanOrEqual(2);
  });

  it('getStatus works without check gating', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    const positions = makePositions([400, 200, 200, 200]);
    const status = guard.getStatus(positions);
    expect(status.needsRebalance).toBe(true);
    expect(status.drift).toBeCloseTo(0.15, 4);
  });

  it('updateTargets replaces existing targets', () => {
    guard.setTargets(makeTargets([0.25, 0.25, 0.25, 0.25]));
    guard.setTargets([
      { tokenId: 'tok-a', targetPct: 0.50 },
      { tokenId: 'tok-b', targetPct: 0.50 },
    ]);
    const targets = guard.getTargets();
    expect(targets).toHaveLength(2);
    expect(targets[0].targetPct).toBe(0.50);
  });
});
