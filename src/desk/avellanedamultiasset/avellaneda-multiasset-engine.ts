/**
 * Wave 243: Avellaneda & Stoikov (2008) Multi-Asset Spread Quoting Engine
 * Strictly < 50 LOC, zero :any.
 */

import {
  MultiAssetQuoteConfig,
  MultiAssetInventoryState,
  MultiAssetTwoSidedQuotes,
} from './avellaneda-multiasset-types';
import { computeMultiAssetQuotes } from './avellaneda-multiasset-math';

export class AvellanedaMultiAssetEngine {
  private readonly config: MultiAssetQuoteConfig;

  constructor(config: MultiAssetQuoteConfig) {
    if (config.assetCorrelationRho < -1 || config.assetCorrelationRho > 1) {
      throw new Error('Correlation rho must be between -1 and 1');
    }
    this.config = config;
  }

  public calculateQuotes(state: MultiAssetInventoryState): MultiAssetTwoSidedQuotes {
    if (state.currentTimeT > this.config.terminalTimeT) {
      throw new Error('currentTimeT cannot exceed terminalTimeT');
    }
    return computeMultiAssetQuotes(state, this.config);
  }
}
