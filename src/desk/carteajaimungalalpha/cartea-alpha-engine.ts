/**
 * Wave 245: Cartea & Jaimungal (2014) Optimal Market Making with Alpha Predictor Engine
 * Strictly < 50 LOC, zero :any.
 */

import { CarteaAlphaMmConfig, CarteaAlphaQuotes } from './cartea-alpha-types';
import { computeCarteaAlphaQuotes } from './cartea-alpha-math';

export class CarteaAlphaMmEngine {
  private readonly config: CarteaAlphaMmConfig;

  constructor(config: CarteaAlphaMmConfig) {
    if (config.fillProbabilityKappa <= 0) {
      throw new Error('fillProbabilityKappa must be strictly positive');
    }
    if (Math.abs(config.inventoryQ) > config.maxInventoryLimitQBar) {
      throw new Error('inventoryQ exceeds maxInventoryLimitQBar');
    }
    this.config = config;
  }

  public getOptimalQuotes(): CarteaAlphaQuotes {
    return computeCarteaAlphaQuotes(this.config);
  }
}
