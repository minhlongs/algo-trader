/**
 * Consistent Hash Ring Statistics and Serialization Helpers
 */

import type { HashRing, ShardConfig } from './consistent-hash-types';

/**
 * Get all shard IDs currently in the ring
 */
export function getShardIds(ring: HashRing): number[] {
  return Array.from(new Set(ring.ring.values())).sort((a, b) => a - b);
}

/**
 * Check if distribution is balanced (variance < threshold)
 */
export function isBalanced(
  distribution: Map<number, number>,
  maxVariance: number = 0.2,
): boolean {
  const counts = Array.from(distribution.values());
  if (counts.length === 0) return true;

  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const maxDeviation = Math.max(...counts.map((c) => Math.abs(c - avg) / avg));

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
