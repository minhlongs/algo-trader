/**
 * Tests for shard-manager-routing — exercises the pure routing helpers
 * (getShardAssignment, computeRingState, rebuildRing, collectRingMetrics,
 * createDefaultShardHealth) and the async fetchAllStrategyIds merge path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRing } from '../../desk/utils/consistent-hash';

type Mod = typeof import('../shard-manager-routing');
let mod: Mod;

function makeStorage(keys: string[]) {
  return {
    list: vi.fn().mockResolvedValue(new Map(keys.map((k) => [k, null]))),
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mod = await import('../shard-manager-routing');
});

// ─── getShardAssignment ─────────────────────────────────────────────────────

describe('getShardAssignment', () => {
  it('returns -1 when the ring is not initialized', () => {
    expect(mod.getShardAssignment(null, 'strat-1')).toBe(-1);
  });

  it('returns the consistent-hash shard for a strategy id when ring exists', () => {
    const ring = buildRing(12, 100);
    const assignment = mod.getShardAssignment(ring, 'strat-1');
    expect(typeof assignment).toBe('number');
    expect(assignment).toBeGreaterThanOrEqual(0);
  });
});

// ─── computeRingState ────────────────────────────────────────────────────────

describe('computeRingState', () => {
  it('returns an empty, balanced state when ring is null', () => {
    const state = mod.computeRingState(null, []);
    expect(state.totalShards).toBe(12);
    expect(state.virtualNodesPerShard).toBe(100);
    expect(state.balanced).toBe(true);
    // every shard has 0 assignments
    for (let i = 0; i < 12; i++) {
      expect(state.distribution.get(i)).toBe(0);
    }
  });

  it('computes distribution from a real ring with strategy ids', () => {
    const ring = buildRing(12, 100);
    const state = mod.computeRingState(ring, ['a', 'b', 'c']);
    expect(state.totalShards).toBe(12);
    // at least one shard has an assignment
    const counts = Array.from(state.distribution.values());
    expect(counts.reduce((s, n) => s + n, 0)).toBe(3);
    expect(typeof state.balanced).toBe('boolean');
  });

  it('isBalanced reflects even vs uneven distribution', () => {
    const ring = buildRing(12, 100);
    // id1,id3,id5,id11,id13,id15,id0,id2,id4 → 3 shards × 3 each → balanced
    const balancedState = mod.computeRingState(ring, [
      'id1', 'id3', 'id5', 'id11', 'id13', 'id15', 'id0', 'id2', 'id4',
    ]);
    expect(balancedState.balanced).toBe(true);
    // + id10 lands on a 4th shard → counts 3,3,3,1 → |3-1| > 1 → uneven
    const unevenState = mod.computeRingState(ring, [
      'id1', 'id3', 'id5', 'id11', 'id13', 'id15', 'id0', 'id2', 'id4', 'id10',
    ]);
    expect(unevenState.balanced).toBe(false);
  });
});

// ─── rebuildRing ─────────────────────────────────────────────────────────────

describe('rebuildRing', () => {
  it('returns a HashRing with the full shard set', () => {
    const ring = mod.rebuildRing();
    expect(ring.ring.size).toBe(12 * 100);
    expect(ring.shardIds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

// ─── collectRingMetrics ──────────────────────────────────────────────────────

describe('collectRingMetrics', () => {
  it('returns a zeroed state when ring is null', () => {
    const m = mod.collectRingMetrics(null, null);
    expect(m.deviation).toBe(0);
    expect(m.isBalanced).toBe(true);
    expect(m.movesNeeded).toBe(0);
    for (let i = 0; i < 12; i++) {
      expect(m.currentDistribution[i]).toBe(0);
    }
  });

  it('computes current distribution and balanced flag from a real ring', () => {
    const ring = buildRing(12, 100);
    const m = mod.collectRingMetrics(ring, null);
    const total = Object.values(m.currentDistribution).reduce((s, n) => s + n, 0);
    expect(total).toBe(0); // no strategies passed to getDistribution
    expect(m.deviation).toBe(0);
  });

  it('computes deviation against a previous distribution', () => {
    const ring = buildRing(12, 100);
    const m = mod.collectRingMetrics(ring, { 0: 5, 1: 2 });
    // deviation = average abs difference across all 12 shards
    expect(m.deviation).toBeGreaterThan(0);
  });

  it('counts moves needed when a shard deviates from ideal by > 10%', () => {
    const ring = buildRing(12, 100);
    // Every shard lands at 0 → diff |0 - 8.33| > 0.833 → 12 moves
    const m = mod.collectRingMetrics(ring, null);
    expect(m.movesNeeded).toBe(12);
  });
});

// ─── createDefaultShardHealth ────────────────────────────────────────────────

describe('createDefaultShardHealth', () => {
  it('returns a healthy ShardHealth record with zeros', () => {
    const before = Date.now();
    const health = mod.createDefaultShardHealth(5);
    expect(health.shardId).toBe(5);
    expect(health.rps).toBe(0);
    expect(health.avgLatencyMs).toBe(0);
    expect(health.errorCount).toBe(0);
    expect(health.strategyCount).toBe(0);
    expect(health.status).toBe('healthy');
    expect(health.lastHeartbeat).toBeGreaterThanOrEqual(before);
  });
});

// ─── fetchAllStrategyIds ─────────────────────────────────────────────────────

describe('fetchAllStrategyIds', () => {
  it('merges redis sorted-set members with storage strategy: keys', async () => {
    const redis = { zrange: vi.fn().mockResolvedValue(['redis-a', 'redis-b']) } as never;
    const storage = makeStorage(['strategy:x', 'strategy:y', 'other:z']);
    const ids = await mod.fetchAllStrategyIds(redis, storage);
    expect(ids).toContain('redis-a');
    expect(ids).toContain('redis-b');
    expect(ids).toContain('x');
    expect(ids).toContain('y');
    expect(ids).not.toContain('other:z');
    expect(ids).not.toContain('strategy:x');
  });

  it('falls back to storage only when redis is null', async () => {
    const storage = makeStorage(['strategy:only']);
    const ids = await mod.fetchAllStrategyIds(null, storage);
    expect(ids).toEqual(['only']);
  });

  it('continues past a redis failure and uses storage keys', async () => {
    const redis = { zrange: vi.fn().mockRejectedValue(new Error('redis down')) } as never;
    const storage = makeStorage(['strategy:fallback']);
    const ids = await mod.fetchAllStrategyIds(redis, storage);
    expect(ids).toEqual(['fallback']);
  });

  it('deduplicates ids present in both redis and storage', async () => {
    const redis = { zrange: vi.fn().mockResolvedValue(['dup', 'redis-only']) } as never;
    const storage = makeStorage(['strategy:dup']);
    const ids = await mod.fetchAllStrategyIds(redis, storage);
    expect(ids).toEqual(expect.arrayContaining(['dup', 'redis-only']));
    expect(ids.filter((i) => i === 'dup')).toHaveLength(1);
  });
});