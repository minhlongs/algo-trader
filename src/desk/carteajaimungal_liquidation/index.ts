/**
 * Wave 240: Cartea & Jaimungal (2014) Optimal Liquidation Engine
 * Strictly < 80 LOC, zero :any.
 */

import {
  CarteaJaimungalLiquidationConfig,
  InventoryTrackingAssessment,
} from './cartea-jaimungal-liquidation-types';
import { computeCarteaJaimungalLiquidation } from './cartea-jaimungal-liquidation-math';

export class CarteaJaimungalLiquidationEngine {
  private readonly config: CarteaJaimungalLiquidationConfig;

  constructor(config: CarteaJaimungalLiquidationConfig) {
    if (config.runningInventoryPenaltyPhi < 0) {
      throw new Error('runningInventoryPenaltyPhi must be non-negative');
    }
    if (config.terminalInventoryPenaltyAlpha < 0) {
      throw new Error('terminalInventoryPenaltyAlpha must be non-negative');
    }
    this.config = config;
  }

  public planOptimalExecution(initialInventory: number, intervals: number): InventoryTrackingAssessment {
    return computeCarteaJaimungalLiquidation(initialInventory, intervals, this.config);
  }
}

export * from './cartea-jaimungal-liquidation-types';
export * from './cartea-jaimungal-liquidation-math';
