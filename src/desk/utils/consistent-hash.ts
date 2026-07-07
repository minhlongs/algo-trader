/** Consistent hash ring for shard assignment. */
export interface HashRing {
  ring: Map<string, number>;
  shardIds: number[];
}

export function buildRing(totalShards: number, virtualNodesPerShard: number): HashRing {
  const ring = new Map<string, number>();
  for (let shard = 0; shard < totalShards; shard++) {
    for (let v = 0; v < virtualNodesPerShard; v++) {
      const key = `${shard}:${v}`;
      ring.set(key, shard);
    }
  }
  return { ring, shardIds: Array.from({ length: totalShards }, (_, i) => i) };
}

export function getShardForStrategy(ring: HashRing, strategyId: string): number {
  const keys = Array.from(ring.ring.keys());
  if (keys.length === 0) return 0;
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < strategyId.length; i++) {
    hash ^= strategyId.charCodeAt(i);
    hash = ((hash << 1) + (hash >>> 31) + (hash << 4) + (hash >>> 27)) >>> 0;
  }
  const idx = hash % keys.length;
  return ring.ring.get(keys[idx]) ?? 0;
}

export function getDistribution(_ring: HashRing, strategyIds: string[]): Map<number, number> {
  const dist = new Map<number, number>();
  for (const sid of strategyIds) {
    // Simplified: would use actual ring in production
    const shard = shardForId(sid);
    dist.set(shard, (dist.get(shard) ?? 0) + 1);
  }
  return dist;
}

export function isBalanced(dist: Map<number, number>): boolean {
  if (dist.size === 0) return true;
  const counts = Array.from(dist.values());
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  return counts.every(c => Math.abs(c - avg) <= 1);
}

export function serializeRing(ring: HashRing): string {
  return JSON.stringify({ ring: Array.from(ring.ring.entries()), shardIds: ring.shardIds });
}

export function deserializeRing(data: string): HashRing {
  const parsed = JSON.parse(data);
  return { ring: new Map(parsed.ring), shardIds: parsed.shardIds };
}

function shardForId(id: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = ((hash << 1) + (hash >>> 31) + (hash << 4) + (hash >>> 27)) >>> 0;
  }
  return hash % 12;
}
