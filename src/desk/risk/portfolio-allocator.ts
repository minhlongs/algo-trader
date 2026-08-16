/**
 * Portfolio Allocation Layer
 *
 * Manages allocation across multiple strategies with regime awareness.
 * Provides equal-weight distribution, actual weight tracking, and rebalance detection.
 */
import { logger } from '../../shared/utils/logger';

/**
 * Allocation entry for a single strategy.
 */
export interface StrategyAllocation {
  strategyId: string;
  targetWeight: number;
  currentWeight: number;
}

/**
 * Configuration for the portfolio allocator.
 */
export interface PortfolioAllocatorConfig {
  maxStrategies: number;
  maxTotalWeight: number;
  rebalanceThreshold: number;
  regimeAware: boolean;
}

/**
 * Snapshot of the current portfolio allocation state.
 */
export interface PortfolioState {
  allocations: StrategyAllocation[];
  totalWeight: number;
  needsRebalance: boolean;
}

/**
 * PortfolioAllocator manages target and actual weights for multiple strategies,
 * detects when rebalancing is needed, and respects portfolio-level constraints.
 */
export class PortfolioAllocator {
  private readonly maxStrategies: number;
  private readonly maxTotalWeight: number;
  private readonly rebalanceThreshold: number;
  private readonly regimeAware: boolean;

  private readonly allocations: Map<string, { target: number; current: number }>;

  /**
   * Create a PortfolioAllocator with the given configuration.
   *
   * @param config - allocation constraints and toggles
   */
  constructor(config: PortfolioAllocatorConfig) {
    this.maxStrategies = config.maxStrategies;
    this.maxTotalWeight = config.maxTotalWeight;
    this.rebalanceThreshold = config.rebalanceThreshold;
    this.regimeAware = config.regimeAware;
    this.allocations = new Map();
  }

  /**
   * Set equal target weight for each provided strategy ID.
   * Truncates to maxStrategies and normalizes so total weight <= maxTotalWeight.
   *
   * @param ids - ordered list of strategy identifiers
   */
  setWeights(ids: string[]): void {
    const count = Math.min(ids.length, this.maxStrategies);
    if (count === 0) {
      this.allocations.clear();
      logger.debug('PortfolioAllocator.setWeights: cleared allocations');
      return;
    }

    const weight = Math.min(this.maxTotalWeight / count, this.maxTotalWeight);
    const newMap: Map<string, { target: number; current: number }> = new Map();
    for (let i = 0; i < count; i++) {
      const id = ids[i]!;
      const prev = this.allocations.get(id);
      newMap.set(id, { target: weight, current: prev?.current ?? 0 });
    }
    this.allocations.clear();
    for (const [id, value] of newMap) {
      this.allocations.set(id, value);
    }
    logger.debug(`PortfolioAllocator.setWeights: assigned weight ${weight} to ${count} strategies`);
  }

  /**
   * Update the actual (current) weight for a strategy based on execution data.
   *
   * @param strategyId - strategy identifier
   * @param weight - observed weight after fills
   */
  updateActualWeight(strategyId: string, weight: number): void {
    const entry = this.allocations.get(strategyId);
    if (!entry) {
      logger.warn(`PortfolioAllocator.updateActualWeight: unknown strategyId ${strategyId}`);
      return;
    }
    entry.current = weight;
    logger.debug(`PortfolioAllocator.updateActualWeight: ${strategyId} -> ${weight}`);
  }

  /**
   * Check whether any allocation deviates from target beyond the rebalance threshold.
   *
   * @returns true if rebalance is required
   */
  needsRebalance(): boolean {
    if (this.allocations.size === 0) return false;
    for (const [, value] of this.allocations) {
      if (Math.abs(value.current - value.target) > this.rebalanceThreshold) {
        return true;
      }
    }
    return false;
  }

  /**
   * Return a snapshot of the current portfolio state.
   *
   * @returns PortfolioState with allocations, total weight, and rebalance flag
   */
  getState(): PortfolioState {
    const allocations: StrategyAllocation[] = [];
    let totalWeight = 0;
    for (const [id, value] of this.allocations) {
      allocations.push({ strategyId: id, targetWeight: value.target, currentWeight: value.current });
      totalWeight += value.current;
    }
    return {
      allocations,
      totalWeight,
      needsRebalance: this.needsRebalance(),
    };
  }
}