import { logger } from '../../shared/utils/logger';
import type { ReplayMessage } from './message-replay-types';

export interface RedisReplayPruneClient {
  scan(cursor: string, matchKey: string, matchPattern: string, countKey: string, countVal: number): Promise<[string, string[]]>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zcard(key: string): Promise<number>;
  del(key: string): Promise<number>;
}

export async function pruneStaleMessages(
  client: RedisReplayPruneClient,
  prefix: string,
  cutoff: number,
): Promise<number> {
  let totalPruned = 0;

  try {
    const pattern = `${prefix}:*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const all = await client.zrange(key, 0, -1);
        const toRemove: string[] = [];

        for (const item of all) {
          try {
            const entry = JSON.parse(item) as ReplayMessage;
            if (entry.timestamp < cutoff) {
              toRemove.push(item);
            }
          } catch {
            toRemove.push(item);
          }
        }

        if (toRemove.length > 0) {
          await client.zrem(key, ...toRemove);
          totalPruned += toRemove.length;
        }

        const remaining = await client.zcard(key);
        if (remaining === 0) {
          await client.del(key);
        }
      }
    } while (cursor !== '0');

    if (totalPruned > 0) {
      logger.info(`[ReplayBuffer] Pruned ${totalPruned} stale messages`);
    }
  } catch (err) {
    logger.error('[ReplayBuffer] Cleanup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return totalPruned;
}
