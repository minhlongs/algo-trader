/**
 * Consistent Hash Ring for Sharding
 * Distributes strategies across shards using virtual nodes for even load
 *
 * Performance target: <5ms shard lookup latency
 */

export interface ShardConfig {
  shardId: number;
  totalShards: number;
  virtualNodes: number;
}

export interface HashRing {
  ring: Map<number, number>; // hash → shardId
  shardConfigs: Map<number, ShardConfig>;
  virtualNodeCount: number;
  sortedHashes?: number[]; // cached sorted keys for binary search
}

/**
 * MurmurHash3_x86_32 implementation for strong avalanche effect.
 * Returns unsigned 32-bit integer.
 */
function murmurhash3_32(key: string, seed = 0): number {
  let h1 = seed | 0;
  const c1 = 0xcc9e2d51 | 0;
  const c2 = 0x1b873593 | 0;
  const nblocks = Math.floor(key.length / 4);

  // body
  for (let i = 0; i < nblocks; i++) {
    let k1 = 0;
    const offset = i * 4;
    k1 |= key.charCodeAt(offset) & 0xff;
    k1 |= (key.charCodeAt(offset + 1) & 0xff) << 8;
    k1 |= (key.charCodeAt(offset + 2) & 0xff) << 16;
    k1 |= (key.charCodeAt(offset + 3) & 0xff) << 24;

    k1 = (k1 * c1) >>> 0;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = (k1 * c2) >>> 0;

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (h1 * 5 + 0xe6546b64) >>> 0;
  }

  // tail
  let k1_tail = 0;
  const tail = key.length & 3;
  if (tail === 3) k1_tail ^= (key.charCodeAt(nblocks * 4 + 2) & 0xff) << 16;
  if (tail >= 2) k1_tail ^= (key.charCodeAt(nblocks * 4 + 1) & 0xff) << 8;
  if (tail >= 1) k1_tail ^= (key.charCodeAt(nblocks * 4) & 0xff);

  k1_tail = (k1_tail * c1) >>> 0;
  k1_tail = (k1_tail << 15) | (k1_tail >>> 17);
  k1_tail = (k1_tail * c2) >>> 0;
  h1 ^= k1_tail;

  // finalization
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = (h1 * 0x85ebca6b) >>> 0;
  h1 ^= h1 >>> 13;
  h1 = (h1 * 0xc2b2ae35) >>> 0;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Hash function using MurmurHash3 for strong avalanche.
 * Works in Cloudflare Workers without external dependencies.
 * Returns 32-bit unsigned integer.
 */
export function hashString(key: string): number {
  return murmurhash3_32(key, 0);
}

/**
 * Build consistent hash ring with virtual nodes
 * Creates virtual nodes for each physical shard to ensure even distribution
 */
export function buildRing(
  shardCount: number,
  virtualNodesPerShard: number = 100
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
 * Get all shard IDs currently in the ring
 */
export function getShardIds(ring: HashRing): number[] {
  return Array.from(new Set(ring.ring.values())).sort((a, b) => a - b);
}

/**
 * Get strategies assigned to a specific shard
 * Returns all strategy IDs that map to the given shard
 */
export function getStrategiesForShard(
  ring: HashRing,
  shardId: number,
  strategyIds: string[]
): string[] {
  return strategyIds.filter(
    (strategyId) => getShardForStrategy(ring, strategyId) === shardId
  );
}

/**
 * Calculate distribution statistics
 * Returns the number of strategies per shard
 */
export function getDistribution(
  ring: HashRing,
  strategyIds: string[]
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

/**
 * Check if distribution is balanced (variance < threshold)
 */
export function isBalanced(
  distribution: Map<number, number>,
  maxVariance: number = 0.2
): boolean {
  const counts = Array.from(distribution.values());
  if (counts.length === 0) return true;

  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const maxDeviation = Math.max(...counts.map(c => Math.abs(c - avg) / avg));

  return maxDeviation <= maxVariance;
}

/**
 * Serialize ring for persistence
 */
export function serializeRing(ring: HashRing): string {
  const data = {
    ring: Array.from(ring.ring.entries()),
    shardConfigs: Array.from(ring.shardConfigs.entries()),
    virtualNodeCount: ring.virtualNodeCount,
  };
  return JSON.stringify(data);
}

/**
 * Deserialize ring from persistence
 */
export function deserializeRing(data: string): HashRing {
  const parsed = JSON.parse(data);
  const ring = new Map<number, number>(parsed.ring);
  const shardConfigs = new Map<number, ShardConfig>(parsed.shardConfigs);
  const sortedHashes = Array.from(ring.keys()).sort((a, b) => a - b);
  return { ring, shardConfigs, virtualNodeCount: parsed.virtualNodeCount, sortedHashes };
}
