/**
 * Wave 224: Cartea, Jaimungal & Ricci (2014) Algorithmic Trading with Cross-Asset Signals Engine.
 *
 * Strictly < 50 LOC, zero :any.
 */

import type { CarteaCrossAssetConfig, QuoteSkewResult } from './cartea-cross-asset-types';
import { CarteaCrossAssetMath } from './cartea-cross-asset-math';

export class CarteaCrossAssetEngine {
  constructor(private readonly config: CarteaCrossAssetConfig) {}

  public getOptimalQuotes(currentInventoryQ: number, crossAssetAlpha: number): QuoteSkewResult {
    return CarteaCrossAssetMath.computeQuoteSkews(
      this.config,
      currentInventoryQ,
      crossAssetAlpha
    );
  }

  public getNetSpread(currentInventoryQ: number, crossAssetAlpha: number): number {
    const quotes = this.getOptimalQuotes(currentInventoryQ, crossAssetAlpha);
    return Number((quotes.askSpread + quotes.bidSpread).toFixed(5));
  }
}
