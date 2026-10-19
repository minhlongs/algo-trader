/**
 * Wave 239: Gatheral & Schied (2011) Optimal Execution Engine
 * Strictly < 80 LOC, zero :any.
 */

import { GatheralSchiedGbmConfig, GatheralSchiedExecutionSchedule } from './gatheral-schied-types';
import { computeGbmOptimalSchedule } from './gatheral-schied-math';

export class GatheralSchiedGbmEngine {
  private readonly config: GatheralSchiedGbmConfig;

  constructor(config: GatheralSchiedGbmConfig) {
    if (config.initialStockPriceS0 <= 0) {
      throw new Error('Initial stock price must be positive');
    }
    if (config.annualVolatilitySigma < 0) {
      throw new Error('Volatility must be non-negative');
    }
    this.config = config;
  }

  public generateSchedule(initialShares: number, intervals: number): GatheralSchiedExecutionSchedule {
    return computeGbmOptimalSchedule(initialShares, intervals, this.config);
  }
}

export * from './gatheral-schied-types';
export * from './gatheral-schied-math';
