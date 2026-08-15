/**
 * Memory Pool for Buffer Reuse
 * Reuses ArrayBuffers and objects to reduce GC pressure
 *
 * Target: Reduce major GC frequency by 50%
 */

import { logger } from './logger';

export interface PooledObject<T extends { reset(): void }> {
  obj: T;
  lastUsed: number;
  useCount: number;
}

export interface PoolStats {
  poolSize: number;
  allocated: number;
  inUse: number;
  available: number;
  utilization: number;
}

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

  constructor(
    factory: () => T,
    options: { initialSize?: number; maxSize?: number; idleTimeoutMs?: number } = {}
  ) {
    this.factory = factory;
    this.maxSize = options.maxSize || 50;
    this.idleTimeoutMs = options.idleTimeoutMs || 60000; // 1 minute

    // Pre-allocate initial pool
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
    // Find available object (not in use)
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const pooled = this.pool[i];
      if (pooled.useCount === 0 || pooled.lastUsed < Date.now() - this.idleTimeoutMs) {
        pooled.useCount++;
        pooled.lastUsed = Date.now();
        return pooled.obj;
      }
    }

    // Pool exhausted - create new if under limit
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

    // Force evict oldest (FIFO)
    const evicted = this.pool.shift();
    if (evicted) {
      this.pool.push({
        obj: evicted.obj,
        lastUsed: Date.now(),
        useCount: 1,
      });
      return evicted.obj;
    }

    // Fallback: create anyway (shouldn't happen)
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

    // Object not from this pool - ignore
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const inUse = this.pool.filter(p => p.useCount > 0).length;
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
    return this.pool.filter(p => p.useCount === 0).length;
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
 * Pooled JSON parser - resets buffer between uses
 */
export class PooledJSONParser {
  private buffer: string = '';

  parse(chunk: string): unknown[] {
    const items: unknown[] = [];
    const parts = (this.buffer + chunk).split('\n');

    // Last part may be incomplete
    this.buffer = parts.pop() || '';

    for (const part of parts) {
      if (part.trim()) {
        try {
          items.push(JSON.parse(part));
        } catch {
          // Skip malformed JSON
        }
      }
    }

    return items;
  }

  reset(): void {
    this.buffer = '';
  }
}

/**
 * Pooled buffer (Uint8Array wrapper with reset)
 */
export class PooledBuffer {
  private buffer: Uint8Array;

  constructor(size: number = 8192) {
    this.buffer = new Uint8Array(size);
  }

  getBuffer(): Uint8Array {
    return this.buffer;
  }

  getLength(): number {
    return this.buffer.length;
  }

  reset(): void {
    this.buffer.fill(0);
  }

  slice(start: number, end: number): Uint8Array {
    return this.buffer.slice(start, end);
  }
}

/**
 * Pre-configured pools for common use cases
 */
export const parserPool = new MemoryPool(
  () => new PooledJSONParser(),
  { initialSize: 5, maxSize: 20, idleTimeoutMs: 30000 }
);

export const bufferPool = new MemoryPool(
  () => new PooledBuffer(8192),
  { initialSize: 10, maxSize: 100, idleTimeoutMs: 30000 }
);

// Strategy instance pool (for frequently used strategies)
export const strategyPool = new MemoryPool(
  () => ({ reset: () => {} } as { reset(): void }), // Placeholder - would be actual strategy
  { initialSize: 5, maxSize: 25, idleTimeoutMs: 600000 } // 10 minute idle
);
