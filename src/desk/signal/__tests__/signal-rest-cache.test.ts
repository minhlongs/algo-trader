/**
 * Tests for signal-rest-cache — mocks the Redis client so every
 * set/get/invalidate branch is exercised without a live server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Signal, TierKey } from '../signal-types';

const { mockGetRedis, mockLogger } = vi.hoisted(() => ({
  mockGetRedis: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../redis', () => ({ getRedisClient: mockGetRedis }));
vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

import { setCachedSignals, getCachedSignals, invalidateSignalCache } from '../signal-rest-cache';

function makeRedis() {
  return {
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(0),
  };
}

const TIER: TierKey = 'premium';
const SIGS: Signal[] = [
  { id: 's1', symbol: 'BTCUSDT', side: 'buy', confidence: 0.8, ts: 1 } as unknown as Signal,
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signal-rest-cache: setCachedSignals', () => {
  it('writes JSON-encoded signals under a tier+query key with a short TTL', async () => {
    const redis = makeRedis();
    mockGetRedis.mockReturnValue(redis);

    await setCachedSignals(TIER, 1000, 50, SIGS);

    expect(mockGetRedis).toHaveBeenCalledTimes(1);
    expect(redis.setex).toHaveBeenCalledWith(
      'signal:rest:premium:1000:50',
      10,
      JSON.stringify(SIGS),
    );
  });

  it('swallows Redis write failures and logs a warning', async () => {
    const redis = makeRedis();
    redis.setex.mockRejectedValue(new Error('redis down'));
    mockGetRedis.mockReturnValue(redis);

    await expect(setCachedSignals(TIER, 0, 5, SIGS)).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[SignalCache] Redis write failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
    const meta = mockLogger.warn.mock.calls[0][1] as { err: Error };
    expect(meta.err.message).toContain('redis down');
  });
});

describe('signal-rest-cache: getCachedSignals', () => {
  it('returns null on a cache miss', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue(null);
    mockGetRedis.mockReturnValue(redis);

    const result = await getCachedSignals(TIER, 1000, 50);

    expect(result).toBeNull();
    expect(redis.get).toHaveBeenCalledWith('signal:rest:premium:1000:50');
  });

  it('returns parsed signals on a cache hit', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue(JSON.stringify(SIGS));
    mockGetRedis.mockReturnValue(redis);

    const result = await getCachedSignals(TIER, 1000, 50);

    expect(result).toEqual(SIGS);
  });

  it('returns null and logs when the Redis read throws', async () => {
    const redis = makeRedis();
    redis.get.mockRejectedValue(new Error('redis down'));
    mockGetRedis.mockReturnValue(redis);

    const result = await getCachedSignals(TIER, 0, 5);

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[SignalCache] Redis read failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
    const meta = mockLogger.warn.mock.calls[0][1] as { err: Error };
    expect(meta.err.message).toContain('redis down');
  });

  it('returns null on malformed JSON without throwing', async () => {
    const redis = makeRedis();
    redis.get.mockResolvedValue('{not valid json');
    mockGetRedis.mockReturnValue(redis);

    const result = await getCachedSignals(TIER, 1000, 50);

    // JSON.parse throws -> caught -> null
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[SignalCache] Redis read failed',
      expect.anything(),
    );
  });
});

describe('signal-rest-cache: invalidateSignalCache', () => {
  it('scans for matching keys and deletes them', async () => {
    const redis = makeRedis();
    redis.keys.mockResolvedValue(['signal:rest:a:1:10', 'signal:rest:b:2:20']);
    redis.del.mockResolvedValue(2);
    mockGetRedis.mockReturnValue(redis);

    await invalidateSignalCache();

    expect(redis.keys).toHaveBeenCalledWith('signal:rest:*');
    expect(redis.del).toHaveBeenCalledWith(
      'signal:rest:a:1:10',
      'signal:rest:b:2:20',
    );
  });

  it('skips the delete call when there are no matching keys', async () => {
    const redis = makeRedis();
    redis.keys.mockResolvedValue([]);
    mockGetRedis.mockReturnValue(redis);

    await invalidateSignalCache();

    expect(redis.del).not.toHaveBeenCalled();
  });

  it('swallows invalidation failures and logs a warning', async () => {
    const redis = makeRedis();
    redis.keys.mockRejectedValue(new Error('redis down'));
    mockGetRedis.mockReturnValue(redis);

    await expect(invalidateSignalCache()).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[SignalCache] Invalidation failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
    const meta = mockLogger.warn.mock.calls[0][1] as { err: Error };
    expect(meta.err.message).toContain('redis down');
  });
});

describe('signal-rest-cache: cache key isolation', () => {
  it('never shares a key across tiers', async () => {
    const redis = makeRedis();
    mockGetRedis.mockReturnValue(redis);

    await setCachedSignals('free', 0, 5, SIGS);
    await setCachedSignals('premium', 0, 5, SIGS);

    const keys = redis.setex.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(['signal:rest:free:0:5', 'signal:rest:premium:0:5']);
  });
});