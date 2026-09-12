/**
 * Memory Pool for Buffer Reuse
 * Reuses ArrayBuffers and objects to reduce GC pressure
 * Target: Reduce major GC frequency by 50%
 */

import { logger } from './logger';
import { type PooledObject, type PoolStats, type MemoryPoolOptions } from './memory-pool-types';
import { PooledJSONParser } from './pooled-json-parser';
import { PooledBuffer } from './pooled-buffer';

export { type PooledObject, type PoolStats, type MemoryPoolOptions } from './memory-pool-types';
export { PooledJSONParser } from './pooled-json-parser';
export { PooledBuffer } from './pooled-buffer';

/**
 * Generic memory pool for reusable objects
 * Pre-allocates objects and reuses them to reduce allocation overhead
 */
export class MemoryPool<T extends { reset(): void }> {
  private pool: PooledObject<T>[] = [];
  private factory: () => T;
  private maxSize: number;
  private allocationCount: number = 0;
  private readonly idleTimeoutMs: number;

  constructor(factory: () => T, options: MemoryPoolOptions = {}) {
    this.factory = factory;
    this.maxSize = options.maxSize || 50;
    this.idleTimeoutMs = options.idleTimeoutMs || 60000;

    const initialSize = options.initialSize || 10;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push({
        obj: factory(),
        lastUsed: Date.now(),
        useCount: 0,
      });
    }
  }

  /**
   * Acquire an object from the pool
   * Creates new if pool empty but under limit, otherwise evicts oldest
   */
  acquire(): T {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const pooled = this.pool[i];
      if (pooled.useCount === 0 || pooled.lastUsed < Date.now() - this.idleTimeoutMs) {
        pooled.useCount++;
        pooled.lastUsed = Date.now();
        return pooled.obj;
      }
    }

    if (this.pool.length < this.maxSize) {
      const obj = this.factory();
      this.pool.push({
        obj,
        lastUsed: Date.now(),
        useCount: 1,
      });
      this.allocationCount++;
      return obj;
    }

    const evicted = this.pool.shift();
    if (evicted) {
      this.pool.push({
        obj: evicted.obj,
        lastUsed: Date.now(),
        useCount: 1,
      });
      return evicted.obj;
    }

    return this.factory();
  }

  /**
   * Release an object back to the pool
   */
  release(obj: T): void {
    for (const pooled of this.pool) {
      if (pooled.obj === obj) {
        pooled.useCount = Math.max(0, pooled.useCount - 1);
        pooled.lastUsed = Date.now();
        try {
          obj.reset();
        } catch (error) {
          logger.error('[MemoryPool] Failed to reset object', error);
        }
        return;
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const inUse = this.pool.filter((p) => p.useCount > 0).length;
    return {
      poolSize: this.pool.length,
      allocated: this.allocationCount,
      inUse,
      available: this.pool.length - inUse,
      utilization: this.pool.length > 0 ? inUse / this.pool.length : 0,
    };
  }

  /**
   * Clear pool (release all objects)
   */
  clear(): void {
    this.pool = [];
    this.allocationCount = 0;
  }

  /**
   * Get number of available objects
   */
  getAvailableCount(): number {
    return this.pool.filter((p) => p.useCount === 0).length;
  }

  /**
   * Force cleanup of stale objects
   */
  cleanupStale(): number {
    const now = Date.now();
    let cleaned = 0;

    for (let i = this.pool.length - 1; i >= 0; i--) {
      const pooled = this.pool[i];
      if (pooled.useCount === 0 && pooled.lastUsed < now - this.idleTimeoutMs) {
        this.pool.splice(i, 1);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Pre-configured pools for common use cases
 */
export const parserPool = new MemoryPool(
  () => new PooledJSONParser(), { initialSize: 5, maxSize: 20, idleTimeoutMs: 30000 },
);
export const bufferPool = new MemoryPool(
  () => new PooledBuffer(8192), { initialSize: 10, maxSize: 100, idleTimeoutMs: 30000 },
);
export const strategyPool = new MemoryPool(
  () => ({ reset: () => {} }), { initialSize: 5, maxSize: 25, idleTimeoutMs: 600000 },
);
