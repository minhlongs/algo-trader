/**
 * Unit tests for the in-memory Redis client stub
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getRedisClient } from '../../../src/desk/redis/index';

describe('In-Memory Redis Stub', () => {
  let redis: ReturnType<typeof getRedisClient>;

  beforeEach(() => {
    redis = getRedisClient();
  });

  afterEach(async () => {
    await redis.quit();
    vi.useRealTimers();
  });

  describe('key-value operations', () => {
    it('returns null for missing keys', async () => {
      expect(await redis.get('nonexistent')).toBeNull();
    });

    it('sets and retrieves a value', async () => {
      await redis.set('k1', 'v1');
      expect(await redis.get('k1')).toBe('v1');
    });

    it('overwrites an existing value on re-set', async () => {
      await redis.set('k1', 'v1');
      await redis.set('k1', 'v2');
      expect(await redis.get('k1')).toBe('v2');
    });

    it('deletes keys and reports whether anything was removed', async () => {
      await redis.set('k1', 'v1');
      expect(await redis.del('k1')).toBe(1);
      expect(await redis.get('k1')).toBeNull();
      expect(await redis.del('k1')).toBe(0);
    });
  });

  describe('setex expiration', () => {
    it('stores a value with TTL and deletes it after the timeout', async () => {
      vi.useFakeTimers();
      await redis.setex('temp', 5, 'v');
      expect(await redis.get('temp')).toBe('v');

      vi.advanceTimersByTime(4999);
      expect(await redis.get('temp')).toBe('v');

      vi.advanceTimersByTime(2);
      expect(await redis.get('temp')).toBeNull();
    });
  });

  describe('hash operations', () => {
    it('sets, gets, and lists hash fields', async () => {
      await redis.hset('h1', 'field1', 'value1');
      await redis.hset('h1', 'field2', 'value2');

      expect(await redis.hget('h1', 'field1')).toBe('value1');
      expect(await redis.hget('h1', 'missing')).toBeNull();
      expect(await redis.hgetall('h1')).toEqual({ field1: 'value1', field2: 'value2' });
    });

    it('returns an empty object for a missing hash', async () => {
      expect(await redis.hgetall('nohash')).toEqual({});
      expect(await redis.hget('nohash', 'x')).toBeNull();
    });

    it('returns 1 for each hset regardless of existing field', async () => {
      expect(await redis.hset('h1', 'f', 'a')).toBe(1);
      expect(await redis.hset('h1', 'f', 'b')).toBe(1);
      expect(await redis.hget('h1', 'f')).toBe('b');
    });
  });

  describe('set operations', () => {
    it('adds members and returns the count of newly added members', async () => {
      expect(await redis.sadd('s1', 'a', 'b', 'c')).toBe(3);
      expect(await redis.sadd('s1', 'b', 'd')).toBe(2);
      expect((await redis.smembers('s1')).sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('returns an empty array for a missing set', async () => {
      expect(await redis.smembers('noset')).toEqual([]);
    });
  });

  describe('expire & keys', () => {
    it('reports 1 when key exists and 0 when it does not', async () => {
      await redis.set('present', 'v');
      expect(await redis.expire('present', 60)).toBe(1);
      expect(await redis.expire('absent', 60)).toBe(0);
    });

    it('matches keys by glob-style wildcard patterns', async () => {
      await redis.set('ticker:binance:BTC', '1');
      await redis.set('ticker:bybit:BTC', '2');
      await redis.set('ticker:binance:ETH', '3');
      await redis.set('other:key', '4');

      const all = (await redis.keys('*')).sort();
      expect(all).toEqual(['other:key', 'ticker:binance:BTC', 'ticker:binance:ETH', 'ticker:bybit:BTC']);

      const binance = (await redis.keys('ticker:binance:*')).sort();
      expect(binance).toEqual(['ticker:binance:BTC', 'ticker:binance:ETH']);

      expect(await redis.keys('ticker:kucoin:*')).toEqual([]);
    });
  });

  describe('lifecycle', () => {
    it('answers ping with PONG and reports isOpen', async () => {
      expect(await redis.ping()).toBe('PONG');
      expect(redis.isOpen).toBe(true);
    });

    it('quit clears all internal stores', async () => {
      await redis.set('k', 'v');
      await redis.hset('h', 'f', 'v');
      await redis.sadd('s', 'm');

      await redis.quit();

      expect(await redis.get('k')).toBeNull();
      expect(await redis.hgetall('h')).toEqual({});
      expect(await redis.smembers('s')).toEqual([]);
    });

    it('on() is a no-op that does not throw', () => {
      const listener = vi.fn();
      expect(() => redis.on('error', listener)).not.toThrow();
    });
  });
});
