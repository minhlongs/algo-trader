/**
 * Strategy Loader
 * Lazy loads strategies on-demand to reduce memory footprint
 * Implements strategy registry and assignment lookup
 */

import { logger } from '../../shared/utils/logger';
import type { IStrategy } from './types';
import type { StrategyRegistryEntry } from './loader-types';
import {
  POLYMARKET_STRATEGIES,
  DNA_STRATEGIES,
  getInitialStrategies,
  batchPreloadStrategies,
} from './loader-registry-data';
import {
  persistStrategyAssignments,
  getShardStrategyAssignments,
} from './loader-redis-persistence';

export type { StrategyRegistryEntry };

export class StrategyLoader {
  // Singleton (lazy, optional — undefined until first getInstance call)
  static instance?: StrategyLoader;

  private strategyCache: Map<string, IStrategy> = new Map();
  private strategyMap: Map<string, IStrategy> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private redis: ReturnType<typeof import('../../redis').getRedisClient> | null = null;

  /** Reset singleton for testing */
  static reset(): void {
    StrategyLoader.instance = undefined;
  }

  /** Lazy singleton — default-constructed on first call */
  static getInstance(): StrategyLoader {
    if (!StrategyLoader.instance) {
      StrategyLoader.instance = new StrategyLoader();
    }
    return StrategyLoader.instance;
  }

  // Strategy registry - maps strategy names to module paths
  private registry: Map<string, StrategyRegistryEntry> = new Map();

  constructor() {
    this.initializeRegistry();
  }

  /** Lazy Redis init — called only when Redis is actually needed */
  async initRedis(): Promise<void> {
    if (this.redis) return;
    try {
      const mod = await import('../../redis');
      this.redis = mod.getRedisClient();
    } catch {
      // Redis not available in this runtime (e.g., Workers WASM)
    }
  }

  /** Initialize strategy registry from known strategies */
  private initializeRegistry(): void {
    for (const strategy of getInitialStrategies()) {
      this.registry.set(strategy.name, strategy);
    }

    logger.info('[StrategyLoader] Registry initialized', {
      total: this.registry.size,
      polymarket: POLYMARKET_STRATEGIES.length,
      dna: DNA_STRATEGIES.length,
    });
  }

  /** Register a strategy directly (stores the object for loadStrategy retrieval) */
  registerStrategy(strategy: IStrategy & { id: string }): void {
    this.strategyMap.set(strategy.id, strategy);
  }

  /** Unregister a strategy by ID */
  unloadStrategy(strategyId: string): boolean {
    return this.strategyMap.delete(strategyId);
  }

  /** List all registered strategies */
  listStrategies(): IStrategy[] {
    return Array.from(this.strategyMap.values());
  }

  /** Get registry entry for a strategy */
  getRegistryEntry(strategyId: string): StrategyRegistryEntry | undefined {
    return this.registry.get(strategyId);
  }

  /** Get all registered strategies */
  getAllRegistered(): StrategyRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /** Load strategy by ID — checks in-memory map first, then registry/dynamic import */
  async loadStrategy(strategyId: string): Promise<IStrategy | null> {
    const direct = this.strategyMap.get(strategyId);
    if (direct) {
      return direct;
    }

    const cached = this.strategyCache.get(strategyId);
    const cachedAt = this.cacheTimestamps.get(strategyId);
    if (cached !== undefined && cachedAt && Date.now() - cachedAt < this.CACHE_TTL_MS) {
      logger.debug('[StrategyLoader] Cache hit', { strategyId });
      return cached;
    }

    const entry = this.registry.get(strategyId);
    if (!entry) {
      logger.warn('[StrategyLoader] Unknown strategy', { strategyId });
      return null;
    }

    try {
      logger.debug('[StrategyLoader] Loading strategy', { strategyId, module: entry.module });

      const module = await import(/* @vite-ignore */ entry.module);
      const strategy = module.default || module;

      this.strategyCache.set(strategyId, strategy);
      this.cacheTimestamps.set(strategyId, Date.now());

      logger.info('[StrategyLoader] Strategy loaded', {
        strategyId,
        memoryFootprintMb: entry.memoryFootprintMb,
      });

      return strategy;
    } catch (error) {
      logger.error('[StrategyLoader] Failed to load strategy', {
        strategyId,
        module: entry.module,
        error,
      });
      return null;
    }
  }

  /**
   * Pre-warm cache with frequently used strategies
   * Called by shard initialization to load assigned strategies
   */
  async preloadStrategies(strategyIds: string[]): Promise<Map<string, IStrategy | null>> {
    return batchPreloadStrategies(strategyIds, (id) => this.loadStrategy(id));
  }

  /** Get cache statistics */
  getCacheStats(): { entries: number; hitCount: number; missCount: number } {
    return {
      entries: this.strategyCache.size,
      hitCount: 0,
      missCount: 0,
    };
  }

  /** Clear strategy cache (for memory pressure handling) */
  clearCache(): void {
    this.strategyCache.clear();
    this.cacheTimestamps.clear();
    logger.info('[StrategyLoader] Cache cleared');
  }

  /** Persist strategy assignments to Redis for cross-region visibility */
  async persistAssignments(shardId: number, strategyIds: string[]): Promise<void> {
    await this.initRedis();
    await persistStrategyAssignments(this.redis, shardId, strategyIds);
  }

  /** Get all strategies assigned to a shard */
  async getShardAssignments(shardId: number): Promise<string[]> {
    await this.initRedis();
    return getShardStrategyAssignments(this.redis, shardId);
  }
}

/** Helper returning the singleton instance */
export function getStrategyLoader(): StrategyLoader {
  return StrategyLoader.getInstance();
}

/** Module-level singleton instance */
export const strategyLoader = StrategyLoader.getInstance();
