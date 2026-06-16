/**
 * Strategy Loader
 * Lazy loads strategies on-demand to reduce memory footprint
 * Implements strategy registry and assignment lookup
 */

import { getRedisClient, type RedisClientType } from '../redis';
import { logger } from '../utils/logger';
import type { IStrategy } from './types';

// Strategy registry entry
export interface StrategyRegistryEntry {
  name: string;
  module: string;
  category: string;
  priority: number; // 1-10, lower = higher priority
  memoryFootprintMb: number;
  isHeavy: boolean; // ML/LLM-based strategies
}

export class StrategyLoader {
  private redis: RedisClientType;
  private strategyCache: Map<string, IStrategy> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  // Strategy registry - maps strategy names to module paths
  private registry: Map<string, StrategyRegistryEntry> = new Map();

  constructor() {
    this.redis = getRedisClient();
    this.initializeRegistry();
  }

  /**
   * Initialize strategy registry from known strategies
   * In production, this would load from database or config
   */
  private initializeRegistry(): void {
    // Polymarket strategies (25)
    const polymarketStrategies: StrategyRegistryEntry[] = [
      { name: 'orderbook-depth-ratio', module: '../strategies/polymarket/orderbook-depth-ratio', category: 'arbitrage', priority: 1, memoryFootprintMb: 5, isHeavy: false },
      { name: 'cross-event-drift', module: '../strategies/polymarket/cross-event-drift', category: 'arbitrage', priority: 1, memoryFootprintMb: 8, isHeavy: false },
      { name: 'vol-compression-breakout', module: '../strategies/polymarket/vol-compression-breakout', category: 'momentum', priority: 2, memoryFootprintMb: 6, isHeavy: false },
      { name: 'whale-tracker', module: '../strategies/polymarket/whale-tracker', category: 'flow', priority: 2, memoryFootprintMb: 4, isHeavy: false },
      { name: 'resolution-frontrunner', module: '../strategies/polymarket/resolution-frontrunner', category: 'arbitrage', priority: 1, memoryFootprintMb: 7, isHeavy: false },
      { name: 'multi-leg-hedge', module: '../strategies/polymarket/multi-leg-hedge', category: 'hedging', priority: 3, memoryFootprintMb: 10, isHeavy: false },
      { name: 'regime-adaptive-momentum', module: '../strategies/polymarket/regime-adaptive-momentum', category: 'momentum', priority: 2, memoryFootprintMb: 8, isHeavy: false },
      { name: 'inventory-skew-rebalancer', module: '../strategies/polymarket/inventory-skew-rebalancer', category: 'risk', priority: 3, memoryFootprintMb: 6, isHeavy: false },
      { name: 'bollinger-squeeze', module: '../strategies/polymarket/bollinger-squeeze', category: 'mean-reversion', priority: 3, memoryFootprintMb: 5, isHeavy: false },
      { name: 'relative-strength-rotation', module: '../strategies/polymarket/relative-strength-rotation', category: 'rotational', priority: 2, memoryFootprintMb: 7, isHeavy: false },
      { name: 'time-weighted-mean-reversion', module: '../strategies/polymarket/time-weighted-mean-reversion', category: 'mean-reversion', priority: 3, memoryFootprintMb: 6, isHeavy: false },
      { name: 'stale-quote-sniper', module: '../strategies/polymarket/stale-quote-sniper', category: 'arbitrage', priority: 2, memoryFootprintMb: 4, isHeavy: false },
      { name: 'momentum-cascade', module: '../strategies/polymarket/momentum-cascade', category: 'momentum', priority: 2, memoryFootprintMb: 8, isHeavy: false },
      { name: 'price-impact-estimator', module: '../strategies/polymarket/price-impact-estimator', category: 'flow', priority: 3, memoryFootprintMb: 5, isHeavy: false },
      { name: 'decay-rate-momentum', module: '../strategies/polymarket/decay-rate-momentum', category: 'momentum', priority: 2, memoryFootprintMb: 7, isHeavy: false },
      { name: 'cluster-breakout', module: '../strategies/polymarket/cluster-breakout', category: 'pattern', priority: 3, memoryFootprintMb: 9, isHeavy: false },
      { name: 'gap-fill-reversion', module: '../strategies/polymarket/gap-fill-reversion', category: 'mean-reversion', priority: 3, memoryFootprintMb: 5, isHeavy: false },
      { name: 'recency-bias-exploiter', module: '../strategies/polymarket/recency-bias-exploiter', category: 'behavioral', priority: 4, memoryFootprintMb: 6, isHeavy: false },
      { name: 'weighted-sentiment-aggregator', module: '../strategies/polymarket/weighted-sentiment-aggregator', category: 'sentiment', priority: 4, memoryFootprintMb: 8, isHeavy: true },
      { name: 'order-arrival-rate', module: '../strategies/polymarket/order-arrival-rate', category: 'flow', priority: 3, memoryFootprintMb: 5, isHeavy: false },
      { name: 'regime-switch-detector', module: '../strategies/polymarket/regime-switch-detector', category: 'regime', priority: 2, memoryFootprintMb: 7, isHeavy: false },
      { name: 'event-deadline-scalper', module: '../strategies/polymarket/event-deadline-scalper', category: 'arbitrage', priority: 1, memoryFootprintMb: 4, isHeavy: false },
      { name: 'cross-correlation-lag', module: '../strategies/polymarket/cross-correlation-lag', category: 'statistical', priority: 4, memoryFootprintMb: 10, isHeavy: false },
      { name: 'herd-behavior-detector', module: '../strategies/polymarket/herd-behavior-detector', category: 'behavioral', priority: 4, memoryFootprintMb: 6, isHeavy: false },
      { name: 'info-asymmetry-scanner', module: '../strategies/polymarket/info-asymmetry-scanner', category: 'arbitrage', priority: 2, memoryFootprintMb: 9, isHeavy: false },
      { name: 'mean-variance-optimizer', module: '../strategies/polymarket/mean-variance-optimizer', category: 'portfolio', priority: 3, memoryFootprintMb: 8, isHeavy: false },
      { name: 'pivot-point-bounce', module: '../strategies/polymarket/pivot-point-bounce', category: 'technical', priority: 4, memoryFootprintMb: 4, isHeavy: false },
      { name: 'tail-risk-harvester', module: '../strategies/polymarket/tail-risk-harvester', category: 'risk', priority: 3, memoryFootprintMb: 7, isHeavy: false },
      { name: 'markov-chain-predictor', module: '../strategies/polymarket/markov-chain-predictor', category: 'predictive', priority: 4, memoryFootprintMb: 8, isHeavy: false },
      { name: 'liquidity-migration', module: '../strategies/polymarket/liquidity-migration', category: 'flow', priority: 3, memoryFootprintMb: 5, isHeavy: false },
      { name: 'price-acceleration', module: '../strategies/polymarket/price-acceleration', category: 'momentum', priority: 2, memoryFootprintMb: 6, isHeavy: false },
      { name: 'spread-mean-reversion', module: '../strategies/polymarket/spread-mean-reversion', category: 'arbitrage', priority: 2, memoryFootprintMb: 7, isHeavy: false },
      { name: 'volatility-targeting', module: '../strategies/polymarket/volatility-targeting', category: 'risk', priority: 3, memoryFootprintMb: 6, isHeavy: false },
    ];

    // DNA strategies (5)
    const dnaStrategies: StrategyRegistryEntry[] = [
      {
        name: 'kronos-strategy',
        module: '../strategies/kronos-strategy',
        category: 'temporal',
        priority: 3,
        memoryFootprintMb: 12,
        isHeavy: false,
      },
      {
        name: 'consensus-engine',
        module: '../strategies/dna/consensus-engine',
        category: 'signals',
        priority: 2,
        memoryFootprintMb: 10,
        isHeavy: false,
      },
      {
        name: 'dna-state-store',
        module: '../strategies/dna/dna-state-store',
        category: 'state',
        priority: 4,
        memoryFootprintMb: 5,
        isHeavy: false,
      },
      {
        name: 'orchestrator',
        module: '../strategies/dna/orchestrator',
        category: 'meta',
        priority: 1,
        memoryFootprintMb: 15,
        isHeavy: false,
      },
      {
        name: 'paper-executor',
        module: '../strategies/dna/paper-executor',
        category: 'execution',
        priority: 2,
        memoryFootprintMb: 8,
        isHeavy: false,
      },
    ];

    // Register all strategies
    for (const strategy of [...polymarketStrategies, ...dnaStrategies]) {
      this.registry.set(strategy.name, strategy);
    }

    logger.info('[StrategyLoader] Registry initialized', {
      total: this.registry.size,
      polymarket: polymarketStrategies.length,
      dna: dnaStrategies.length,
    });
  }

  /**
   * Get registry entry for a strategy
   */
  getRegistryEntry(strategyId: string): StrategyRegistryEntry | undefined {
    return this.registry.get(strategyId);
  }

  /**
   * Get all registered strategies
   */
  getAllRegistered(): StrategyRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Load strategy by ID (lazy loading with simple cache)
   */
  async loadStrategy(strategyId: string): Promise<IStrategy | null> {
    // Check cache first
    const cached = this.strategyCache.get(strategyId);
    const cachedAt = this.cacheTimestamps.get(strategyId);
    if (cached !== undefined && cachedAt && Date.now() - cachedAt < this.CACHE_TTL_MS) {
      logger.debug('[StrategyLoader] Cache hit', { strategyId });
      return cached;
    }

    // Get registry entry
    const entry = this.registry.get(strategyId);
    if (!entry) {
      logger.warn('[StrategyLoader] Unknown strategy', { strategyId });
      return null;
    }

    try {
      logger.debug('[StrategyLoader] Loading strategy', { strategyId, module: entry.module });

      // Dynamic import for lazy loading
      const module = await import(entry.module);
      const strategy = module.default || module;

      // Cache the strategy
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
    const results = new Map<string, IStrategy | null>();

    // Load in parallel with concurrency limit
    const BATCH_SIZE = 5;
    for (let i = 0; i < strategyIds.length; i += BATCH_SIZE) {
      const batch = strategyIds.slice(i, i + BATCH_SIZE);
      const promises = batch.map(id => this.loadStrategy(id));
      const resultsBatch = await Promise.allSettled(promises);

      batch.forEach((id, idx) => {
        const result = resultsBatch[idx];
        results.set(id, result.status === 'fulfilled' ? result.value : null);
      });

      // Small delay between batches to avoid memory spike
      if (i + BATCH_SIZE < strategyIds.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; hitCount: number; missCount: number } {
    // Simplified - would need tracking counters for accurate hit/miss
    return {
      entries: this.strategyCache.size,
      hitCount: 0,
      missCount: 0,
    };
  }

  /**
   * Clear strategy cache (for memory pressure handling)
   */
  clearCache(): void {
    this.strategyCache.clear();
    this.cacheTimestamps.clear();
    logger.info('[StrategyLoader] Cache cleared');
  }

  /**
   * Persist strategy assignments to Redis for cross-region visibility
   */
  async persistAssignments(
    shardId: number,
    strategyIds: string[]
  ): Promise<void> {
    const key = `shard:${shardId}:strategies`;
    await this.redis.del(key);
    if (strategyIds.length > 0) {
      await this.redis.sadd(key, ...strategyIds);
    }
  }

  /**
   * Get all strategies assigned to a shard
   */
  async getShardAssignments(shardId: number): Promise<string[]> {
    const key = `shard:${shardId}:strategies`;
    return this.redis.smembers(key);
  }
}

// Singleton instance
let strategyLoaderInstance: StrategyLoader | null = null;

export function getStrategyLoader(): StrategyLoader {
  if (!strategyLoaderInstance) {
    strategyLoaderInstance = new StrategyLoader();
  }
  return strategyLoaderInstance;
}
