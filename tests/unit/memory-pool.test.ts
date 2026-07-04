/**
 * Unit Tests for Memory Pool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryPool,
  PooledJSONParser,
  PooledBuffer,
  parserPool,
  bufferPool,
  strategyPool,
} from '../../src/utils/memory-pool';

// Mock class with reset method
class MockObject {
  data: string = '';

  reset(): void {
    this.data = '';
  }

  setValue(value: string): void {
    this.data = value;
  }
}

describe('MemoryPool', () => {
  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const pool = new MemoryPool(() => new MockObject());
      expect(pool.getStats().poolSize).toBe(10);
    });

    it('should initialize with custom options', () => {
      const pool = new MemoryPool(() => new MockObject(), {
        initialSize: 5,
        maxSize: 20,
        idleTimeoutMs: 30000,
      });
      expect(pool.getStats().poolSize).toBe(5);
    });

    it('should pre-allocate objects', () => {
      const pool = new MemoryPool(() => new MockObject(), { initialSize: 3 });
      const stats = pool.getStats();
      expect(stats.poolSize).toBe(3);
      // allocationCount only increments when creating beyond initial size
      expect(stats.allocated).toBe(0);
    });
  });

  describe('acquire', () => {
    it('should acquire available object', () => {
      const pool = new MemoryPool(() => new MockObject(), { initialSize: 2 });
      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      expect(obj1).toBeInstanceOf(MockObject);
      expect(obj2).toBeInstanceOf(MockObject);
      expect(pool.getStats().inUse).toBe(2);
      expect(pool.getStats().available).toBe(0);
    });

    it('should create new object when pool empty but under limit', () => {
      const pool = new MemoryPool(() => new MockObject(), {
        initialSize: 1,
        maxSize: 3,
      });

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      const obj3 = pool.acquire();

      expect(pool.getStats().poolSize).toBe(3);
      expect(pool.getStats().inUse).toBe(3);
    });

    it('should evict oldest when pool at max size', () => {
      const pool = new MemoryPool(() => new MockObject(), {
        initialSize: 2,
        maxSize: 2,
      });

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      // Mark as used
      pool.release(obj1);
      pool.release(obj2);

      // Acquire again - should reuse existing
      const obj3 = pool.acquire();
      expect(pool.getStats().poolSize).toBe(2);
    });
  });

  describe('release', () => {
    it('should return object to pool and reset it', () => {
      const pool = new MemoryPool(() => new MockObject(), { initialSize: 1 });
      const obj = pool.acquire();

      (obj as MockObject).setValue('modified');
      pool.release(obj);

      expect(pool.getStats().inUse).toBe(0);
      expect(pool.getStats().available).toBe(1);
      expect(obj.data).toBe(''); // Reset was called
    });

    it('should handle release of unknown object', () => {
      const pool = new MemoryPool(() => new MockObject(), { initialSize: 1 });
      const externalObj = new MockObject();

      expect(() => pool.release(externalObj)).not.toThrow();
    });

    it('should track use count', () => {
      const pool = new MemoryPool(() => new MockObject(), { initialSize: 1 });
      const obj = pool.acquire();
      const pooledObj = pool['pool'][0];

      expect(pooledObj.useCount).toBe(1);

      pool.release(obj);
      expect(pooledObj.useCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const pool = new MemoryPool(() => new MockObject(), {
        initialSize: 3,
        maxSize: 10,
      });

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(3);
      expect(stats.inUse).toBe(2);
      expect(stats.available).toBe(1);
      expect(stats.utilization).toBeCloseTo(2 / 3, 1);
    });
  });

  describe('clear', () => {
    it('should clear all objects from pool', () => {
      const pool = new MemoryPool(() => new MockObject(), { initialSize: 5 });

      const obj = pool.acquire();
      pool.release(obj);
      pool.clear();

      expect(pool.getStats().poolSize).toBe(0);
      expect(pool.getStats().allocated).toBe(0);
    });
  });

  describe('getAvailableCount', () => {
    it('should return count of available objects', () => {
      const pool = new MemoryPool(() => new MockObject(), { initialSize: 3 });

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      expect(pool.getAvailableCount()).toBe(1);

      pool.release(obj1);
      expect(pool.getAvailableCount()).toBe(2);
    });
  });

  describe('cleanupStale', () => {
    it('should remove stale unused objects', () => {
      vi.useFakeTimers();
      const pool = new MemoryPool(() => new MockObject(), {
        initialSize: 3,
        idleTimeoutMs: 1000,
      });

      // All objects are fresh initially
      expect(pool.getStats().poolSize).toBe(3);

      // Advance time past idle timeout
      vi.advanceTimersByTime(2000);

      const cleaned = pool.cleanupStale();
      expect(cleaned).toBe(3);
      expect(pool.getStats().poolSize).toBe(0);

      vi.useRealTimers();
    });

    it('should not remove objects currently in use', () => {
      vi.useFakeTimers();
      const pool = new MemoryPool(() => new MockObject(), {
        initialSize: 2,
        idleTimeoutMs: 1000,
      });

      const obj = pool.acquire(); // In use

      vi.advanceTimersByTime(2000);

      const cleaned = pool.cleanupStale();
      expect(cleaned).toBe(1); // Only the unused one
      expect(pool.getStats().poolSize).toBe(1);

      pool.release(obj);
      vi.useRealTimers();
    });
  });
});

describe('PooledJSONParser', () => {
  it('should parse JSON lines', () => {
    const parser = new PooledJSONParser();
    const items1 = parser.parse('{"a":1}\n{"b":2}\n');
    parser.parse('{"c":3}\n');

    expect(items1).toHaveLength(2);
    expect(items1[0]).toEqual({ a: 1 });
    expect(items1[1]).toEqual({ b: 2 });
  });

  it('should handle incomplete JSON across chunks', () => {
    const parser = new PooledJSONParser();
    parser.parse('{"a":1}\n{"b');
    const items = parser.parse('":2}\n');

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ b: 2 });
  });

  it('should reset buffer', () => {
    const parser = new PooledJSONParser();
    parser.parse('{"a":1}\n');
    parser.reset();

    const items = parser.parse('{"b":2}\n');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ b: 2 });
  });

  it('should skip malformed JSON', () => {
    const parser = new PooledJSONParser();
    const items = parser.parse('{"a":1}\ninvalid\n{"b":2}\n');

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ a: 1 });
    expect(items[1]).toEqual({ b: 2 });
  });
});

describe('PooledBuffer', () => {
  it('should create buffer of specified size', () => {
    const buffer = new PooledBuffer(8192);
    expect(buffer.getBuffer()).toBeInstanceOf(Uint8Array);
    expect(buffer.getLength()).toBe(8192);
  });

  it('should reset buffer to zeros', () => {
    const buffer = new PooledBuffer(4);
    const buf = buffer.getBuffer();
    buf[0] = 255;
    buf[1] = 255;

    buffer.reset();

    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
  });

  it('should slice buffer correctly', () => {
    const buffer = new PooledBuffer(10);
    const buf = buffer.getBuffer();
    buf.set([1, 2, 3, 4], 0);

    const slice = buffer.slice(0, 4);
    expect(slice).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('should have default size of 8192', () => {
    const buffer = new PooledBuffer();
    expect(buffer.getLength()).toBe(8192);
  });
});

describe('Pre-configured Pools', () => {
  it('parserPool should have correct config', () => {
    expect(parserPool).toBeDefined();
    const stats = parserPool.getStats();
    expect(stats.poolSize).toBe(5);
    expect(parserPool.getAvailableCount()).toBe(5);
  });

  it('bufferPool should have correct config', () => {
    expect(bufferPool).toBeDefined();
    const stats = bufferPool.getStats();
    expect(stats.poolSize).toBe(10);
  });

  it('strategyPool should have correct config', () => {
    expect(strategyPool).toBeDefined();
    const stats = strategyPool.getStats();
    expect(stats.poolSize).toBe(5);
  });
});
