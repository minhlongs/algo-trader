import { describe, expect, it } from 'vitest';
import {
  buildRing,
  deserializeRing,
  getDistribution,
  getShardForStrategy,
  isBalanced,
  serializeRing,
  type HashRing,
} from '../../../../src/desk/utils/consistent-hash';

describe('desk consistent-hash utility', () => {
  it('builds a hash ring with totalShards and virtual nodes', () => {
    const ring = buildRing(4, 10);
    expect(ring.shardIds).toEqual([0, 1, 2, 3]);
    expect(ring.ring.size).toBe(40);
  });

  it('routes strategies consistently to shards', () => {
    const ring = buildRing(6, 20);
    const shard1 = getShardForStrategy(ring, 'alpha-arb-btc');
    const shard2 = getShardForStrategy(ring, 'alpha-arb-btc');
    expect(shard1).toBe(shard2);
    expect(shard1).toBeGreaterThanOrEqual(0);
    expect(shard1).toBeLessThan(6);
  });

  it('returns 0 when getShardForStrategy is given an empty ring', () => {
    const emptyRing: HashRing = { ring: new Map(), shardIds: [] };
    expect(getShardForStrategy(emptyRing, 'any-strategy')).toBe(0);
  });

  it('calculates distribution across strategy IDs', () => {
    const ring = buildRing(4, 10);
    const stratIds = ['strat-1', 'strat-2', 'strat-3', 'strat-4'];
    const dist = getDistribution(ring, stratIds);
    expect(dist.size).toBeGreaterThan(0);
    const sum = Array.from(dist.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBe(4);
  });

  it('evaluates balance correctly', () => {
    expect(isBalanced(new Map())).toBe(true);

    const balancedDist = new Map([
      [0, 10],
      [1, 10],
      [2, 11],
      [3, 9],
    ]);
    expect(isBalanced(balancedDist)).toBe(true);

    const unbalancedDist = new Map([
      [0, 1],
      [1, 20],
    ]);
    expect(isBalanced(unbalancedDist)).toBe(false);
  });

  it('serializes and deserializes a hash ring accurately', () => {
    const ring = buildRing(3, 5);
    const serialized = serializeRing(ring);
    expect(typeof serialized).toBe('string');

    const deserialized = deserializeRing(serialized);
    expect(deserialized.shardIds).toEqual([0, 1, 2]);
    expect(deserialized.ring.size).toBe(15);
    expect(deserialized.ring.get('0:0')).toBe(0);
  });
});
