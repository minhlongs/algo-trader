/**
 * In-memory registry management and lifecycle for StrategyLoader.
 *
 * @module desk/strategies/loader-registry
 */

import { logger } from '../../shared/utils/logger';
import type { IStrategy } from './types';
import type { StrategyRegistryEntry } from './loader-types';
import {
  POLYMARKET_STRATEGIES,
  DNA_STRATEGIES,
  getInitialStrategies,
} from './loader-registry-data';

export class StrategyRegistryManager {
  private registry: Map<string, StrategyRegistryEntry> = new Map();
  private strategyMap: Map<string, IStrategy> = new Map();

  constructor() {
    this.initializeRegistry();
  }

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

  registerStrategy(strategy: IStrategy & { id: string }): void {
    this.strategyMap.set(strategy.id, strategy);
  }

  unloadStrategy(strategyId: string): boolean {
    return this.strategyMap.delete(strategyId);
  }

  listStrategies(): IStrategy[] {
    return Array.from(this.strategyMap.values());
  }

  getDirectStrategy(strategyId: string): IStrategy | undefined {
    return this.strategyMap.get(strategyId);
  }

  getRegistryEntry(strategyId: string): StrategyRegistryEntry | undefined {
    return this.registry.get(strategyId);
  }

  getAllRegistered(): StrategyRegistryEntry[] {
    return Array.from(this.registry.values());
  }
}
