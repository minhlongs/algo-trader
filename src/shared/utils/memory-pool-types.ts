/**
 * Types and interfaces for Memory Pool
 */

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

export interface MemoryPoolOptions {
  initialSize?: number;
  maxSize?: number;
  idleTimeoutMs?: number;
}
