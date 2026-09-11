/**
 * Consistent Hash Ring Types
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
