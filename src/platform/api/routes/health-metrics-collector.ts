import type { Router } from 'express';
/**
 * Health and system metrics collectors
 */

export interface RedisMetrics {
  connected: boolean;
  used_memory: number;
  keys_count: number;
  used_memory_human?: string;
  error?: string;
  uptime_seconds?: number;
}

export interface DiskUsageSnapshot {
  total: number;
  used: number;
  free: number;
}

/**
 * Collect Redis performance and memory statistics
 */
export async function collectRedisMetrics(redis: {
  info: () => Promise<string>;
  keys: (pattern: string) => Promise<string[]>;
}): Promise<RedisMetrics> {
  try {
    const info = await redis.info();
    const infoObj: Record<string, string> = {};
    for (const line of info.split('\r\n')) {
      if (!line || line.startsWith('#')) continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        infoObj[line.slice(0, colonIdx)] = line.slice(colonIdx + 1);
      }
    }

    const usedMemoryBytes = parseInt(infoObj['used_memory'] ?? '0', 10);
    const usedMemoryHuman =
      infoObj['used_memory_human'] ?? `${(usedMemoryBytes / 1024 / 1024).toFixed(2)}M`;

    let keysCount = 0;
    try {
      const keys = await redis.keys('*');
      keysCount = Array.isArray(keys) ? keys.length : 0;
    } catch {
      keysCount = 0;
    }

    return {
      connected: true,
      used_memory: usedMemoryBytes,
      used_memory_human: usedMemoryHuman,
      keys_count: keysCount,
      uptime_seconds: parseInt(infoObj['uptime_in_seconds'] ?? '0', 10),
    };
  } catch (error) {
    return {
      connected: false,
      used_memory: 0,
      keys_count: 0,
      error: error instanceof Error ? error.message : 'Redis info failed',
    };
  }
}

/**
 * Capture runtime disk usage snapshot if platform supports it
 */
export function getDiskUsageSnapshot(): DiskUsageSnapshot | undefined {
  try {
    const diskFn = (process as unknown as Record<string, unknown>)['diskUsage'];
    if (typeof diskFn === 'function') {
      return (diskFn as () => DiskUsageSnapshot)();
    }
  } catch {
    // diskUsage not available in this runtime — skip gracefully
  }
  return undefined;
}
