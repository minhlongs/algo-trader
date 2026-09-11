/**
 * Strategy Loader Redis Persistence
 * Cross-region shard assignment persistence and retrieval via Redis.
 */

export interface IRedisPersistenceClient {
  del(key: string): Promise<number | unknown>;
  sadd(key: string, ...members: string[]): Promise<number | unknown>;
  smembers(key: string): Promise<string[]>;
}

export async function persistStrategyAssignments(
  redis: IRedisPersistenceClient | null,
  shardId: number,
  strategyIds: string[],
): Promise<void> {
  if (!redis) return;
  const key = `shard:${shardId}:strategies`;
  await redis.del(key);
  if (strategyIds.length > 0) {
    await redis.sadd(key, ...strategyIds);
  }
}

export async function getShardStrategyAssignments(
  redis: IRedisPersistenceClient | null,
  shardId: number,
): Promise<string[]> {
  if (!redis) return [];
  const key = `shard:${shardId}:strategies`;
  return redis.smembers(key);
}
