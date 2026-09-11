/**
 * Consistent Hash Ring for Sharding
 * Distributes strategies across shards using virtual nodes for even load
 *
 * Performance target: <5ms shard lookup latency
 */

import type { ShardConfig, HashRing } from './consistent-hash-types';
import { hashString } from './consistent-hash-murmur';
import { getShardIds } from './consistent-hash-stats';

export * from './consistent-hash-types';
export * from './consistent-hash-murmur';
export * from './consistent-hash-stats';

/**
 * Build consistent hash ring with virtual nodes
 * Creates virtual nodes for each physical shard to ensure even distribution
 */
export function buildRing(
  shardCount: number,
  virtualNodesPerShard: number = 100,
): HashRing {
  const ring = new Map<number, number>();
  const shardConfigs = new Map<number, ShardConfig>();

  // Precompute per-shard offsets to decorrelate shard-specific prefixes
  // Using 0x9e3779b9 (golden ratio) to generate pseudo-random offsets
  const shardOffsets: number[] = [];
  for (let shardId = 0; shardId < shardCount; shardId++) {
    let offset = 0;
    // Simple mixing: multiply by golden ratio and add shard-specific stir
    offset = (shardId * 0x9e3779b9) >>> 0;
    offset = (offset * 0x9e3779b9) >>> 0;
    offset = (offset ^ (shardId << 16)) >>> 0;
    shardOffsets.push(offset);
  }

  // Create config for each shard
  for (let shardId = 0; shardId < shardCount; shardId++) {
    shardConfigs.set(shardId, {
      shardId,
      totalShards: shardCount,
      virtualNodes: virtualNodesPerShard,
    });

    const offset = shardOffsets[shardId];

    // Create virtual nodes for this shard
    for (let vnode = 0; vnode < virtualNodesPerShard; vnode++) {
      const virtualKey = `shard-${shardId}:vnode-${vnode}`;
      let vhash = hashString(virtualKey);
      // Mix in shard-specific offset to scatter clusters
      vhash = (vhash + offset) >>> 0;
      ring.set(vhash, shardId);
    }
  }

  // Precompute sorted hashes for fast binary search
  const sortedHashes = Array.from(ring.keys()).sort((a, b) => a - b);

  return { ring, shardConfigs, virtualNodeCount: shardCount * virtualNodesPerShard, sortedHashes };
}

/**
 * Find shard for a given key using binary search on sorted ring
 * Target: <5ms latency
 */
export function getShardForStrategy(ring: HashRing, strategyId: string): number {
  if (ring.ring.size === 0) {
    throw new Error('Hash ring is empty');
  }

  const strategyHash = hashString(strategyId);

  // Use precomputed sortedHashes if available, else compute and cache
  let sortedHashes = ring.sortedHashes;
  if (!sortedHashes) {
    sortedHashes = Array.from(ring.ring.keys()).sort((a, b) => a - b);
    ring.sortedHashes = sortedHashes;
  }

  // Binary search for the first hash >= strategyHash
  let left = 0;
  let right = sortedHashes.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (sortedHashes[mid] < strategyHash) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // If we found an exact or next greater hash, use it
  // Otherwise wrap around to the first hash
  const hashIndex = left < sortedHashes.length ? left : 0;
  const selectedHash = sortedHashes[hashIndex];
  const shardId = ring.ring.get(selectedHash);

  if (shardId === undefined) {
    throw new Error(`Failed to find shard for strategy ${strategyId}`);
  }

  return shardId;
}

/**
 * Get strategies assigned to a specific shard
 * Returns all strategy IDs that map to the given shard
 */
export function getStrategiesForShard(
  ring: HashRing,
  shardId: number,
  strategyIds: string[],
): string[] {
  return strategyIds.filter(
    (strategyId) => getShardForStrategy(ring, strategyId) === shardId,
  );
}

/**
 * Calculate distribution statistics
 * Returns the number of strategies per shard
 */
export function getDistribution(
  ring: HashRing,
  strategyIds: string[],
): Map<number, number> {
  const distribution = new Map<number, number>();

  // Initialize counts for all shards
  for (const shardId of getShardIds(ring)) {
    distribution.set(shardId, 0);
  }

  // Count strategies per shard
  for (const strategyId of strategyIds) {
    const shardId = getShardForStrategy(ring, strategyId);
    distribution.set(shardId, (distribution.get(shardId) || 0) + 1);
  }

  return distribution;
}
