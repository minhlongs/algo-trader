import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hashString,
  buildRing,
  getShardForStrategy,
  getShardIds,
  getStrategiesForShard,
  getDistribution,
  isBalanced,
  serializeRing,
  deserializeRing,
} from '../../src/utils/consistent-hash';

describe('Consistent Hashing', () => {
  describe('hashString', () => {
    it('should return consistent hash for same input', () => {
      const hash1 = hashString('strategy-123');
      const hash2 = hashString('strategy-123');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = hashString('strategy-123');
      const hash2 = hashString('strategy-456');
      expect(hash1).not.toBe(hash2);
    });

    it('should return unsigned 32-bit integers', () => {
      const hash = hashString('test');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    });

    it('should distribute hashes uniformly for similar prefixes', () => {
      const hashes = [];
      for (let i = 0; i < 100; i++) {
        hashes.push(hashString(`strategy-${i}`));
      }

      // Check distribution across ranges
      const buckets = Array(10).fill(0);
      for (const h of hashes) {
        const bucket = Math.floor((h / 2 ** 32) * 10);
        buckets[bucket]++;
      }

      // Each bucket should have roughly 10 items (allow 50% variance)
      for (const count of buckets) {
        expect(count).toBeGreaterThan(3);
        expect(count).toBeLessThan(17);
      }
    });
  });

  describe('buildRing', () => {
    it('should create ring with correct number of virtual nodes', () => {
      const ring = buildRing(12, 100);
      expect(ring.ring.size).toBe(1200); // 12 * 100
    });

    it('should create correct number of shard configs', () => {
      const ring = buildRing(12, 100);
      expect(ring.shardConfigs.size).toBe(12);
    });

    it('should assign all virtual nodes to valid shard IDs', () => {
      const ring = buildRing(12, 100);
      for (const shardId of ring.ring.values()) {
        expect(shardId).toBeGreaterThanOrEqual(0);
        expect(shardId).toBeLessThan(12);
      }
    });

    it('should create evenly distributed ring for small shard count', () => {
      const ring = buildRing(3, 100);
      const distribution = new Map<number, number>();
      for (const shardId of ring.ring.values()) {
        distribution.set(shardId, (distribution.get(shardId) || 0) + 1);
      }

      // Each shard should have exactly 100 virtual nodes
      for (const count of distribution.values()) {
        expect(count).toBe(100);
      }
    });
  });

  describe('getShardForStrategy', () => {
    const ring = buildRing(12, 100);

    it('should return valid shard ID for any strategy', () => {
      for (let i = 0; i < 100; i++) {
        const shardId = getShardForStrategy(ring, `strategy-${i}`);
        expect(shardId).toBeGreaterThanOrEqual(0);
        expect(shardId).toBeLessThan(12);
      }
    });

    it('should provide consistent assignment for same strategy', () => {
      const strategyId = 'polymarket-arb-001';
      const shard1 = getShardForStrategy(ring, strategyId);
      const shard2 = getShardForStrategy(ring, strategyId);
      expect(shard1).toBe(shard2);
    });

    it('should throw for empty ring', () => {
      const emptyRing = { ring: new Map(), shardConfigs: new Map(), virtualNodeCount: 0 };
      expect(() => getShardForStrategy(emptyRing, 'test')).toThrow('Hash ring is empty');
    });

    it('should distribute strategies evenly across shards', () => {
      const strategyIds = Array.from({ length: 1000 }, (_, i) => `strategy-${i}`);
      const distribution = getDistribution(ring, strategyIds);

      const counts = Array.from(distribution.values());
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const maxDeviation = Math.max(...counts.map(c => Math.abs(c - avg) / avg));

      // Allow up to 20% variance
      expect(maxDeviation).toBeLessThan(0.2);
    });
  });

  describe('getShardIds', () => {
    it('should return unique sorted shard IDs', () => {
      const ring = buildRing(12, 100);
      const ids = getShardIds(ring);
      expect(ids).toHaveLength(12);
      expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });
  });

  describe('getStrategiesForShard', () => {
    const ring = buildRing(12, 100);
    const strategies = ['strat-a', 'strat-b', 'strat-c', 'strat-d', 'strat-e'];

    it('should return strategies assigned to given shard', () => {
      const shardId = 0;
      const assigned = getStrategiesForShard(ring, shardId, strategies);
      expect(assigned.every(s => getShardForStrategy(ring, s) === shardId)).toBe(true);
    });

    it('should return empty array if no strategies map to shard', () => {
      // Determine which shard(s) these strategies actually map to
      const mappedShards = strategies.map(s => getShardForStrategy(ring, s));
      const usedShards = new Set(mappedShards);

      // Find a shard that is not used by any of the strategies
      const allShards = new Set(Array.from({ length: 12 }, (_, i) => i));
      const unusedShards = [...allShards].filter(s => !usedShards.has(s));

      // There should be at least one unused shard with only 5 strategies across 12 shards
      expect(unusedShards.length).toBeGreaterThan(0);

      const emptyShard = unusedShards[0];
      const assigned = getStrategiesForShard(ring, emptyShard, strategies);
      expect(assigned).toHaveLength(0);
    });
  });

  describe('getDistribution', () => {
    it('should return map with counts per shard', () => {
      const ring = buildRing(12, 100);
      const strategies = ['a', 'b', 'c', 'd', 'e'];
      const dist = getDistribution(ring, strategies);

      const total = Array.from(dist.values()).reduce((a, b) => a + b, 0);
      expect(total).toBe(strategies.length);
    });

    it('should include all shards even with no strategies', () => {
      const ring = buildRing(12, 100);
      const dist = getDistribution(ring, []);
      expect(dist.size).toBe(12);
      for (const count of dist.values()) {
        expect(count).toBe(0);
      }
    });
  });

  describe('isBalanced', () => {
    it('should return true for balanced distribution', () => {
      const dist = new Map<number, number>([
        [0, 10], [1, 11], [2, 9], [3, 10], [4, 10],
      ]);
      expect(isBalanced(dist, 0.2)).toBe(true);
    });

    it('should return false for unbalanced distribution', () => {
      const dist = new Map<number, number>([
        [0, 1], [1, 1], [2, 1], [3, 50], [4, 50],
      ]);
      expect(isBalanced(dist, 0.2)).toBe(false);
    });

    it('should return true for empty distribution', () => {
      expect(isBalanced(new Map())).toBe(true);
    });
  });

  describe('serialize/deserialize', () => {
    it('should serialize and deserialize ring correctly', () => {
      const ring = buildRing(12, 100);
      const serialized = serializeRing(ring);
      const deserialized = deserializeRing(serialized);

      expect(deserialized.ring.size).toBe(ring.ring.size);
      expect(deserialized.shardConfigs.size).toBe(ring.shardConfigs.size);
      expect(deserialized.virtualNodeCount).toBe(ring.virtualNodeCount);

      // Check a sample of assignments match
      const sampleIds = Array.from(ring.ring.keys()).slice(0, 10);
      for (const id of sampleIds) {
        expect(ring.ring.get(id)).toBe(deserialized.ring.get(id));
      }
    });
  });

  describe('Performance', () => {
    it('should achieve <5ms lookup latency for typical load', () => {
      const ring = buildRing(12, 100);
      const strategyIds = Array.from({ length: 10000 }, (_, i) => `strategy-${i}`);

      const start = performance.now();
      for (const sid of strategyIds) {
        getShardForStrategy(ring, sid);
      }
      const elapsed = performance.now() - start;
      const avg = elapsed / strategyIds.length;

      // Average should be well under 0.1ms for binary search on sorted array
      expect(avg).toBeLessThan(0.1);
    });
  });
});
