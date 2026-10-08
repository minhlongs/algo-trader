/**
 * Adverse Selection Predictor & Post-Trade Markout Engine
 * Measures informed trading toxicity via short-horizon price drift markouts.
 *
 * @module desk/marketmaking/adverse-selection-predictor
 */

import { AdverseSelectionMarkout } from './marketmaking-types';

export class AdverseSelectionPredictor {
  private readonly history: AdverseSelectionMarkout[] = [];
  private readonly toxicBpsThreshold: number;
  private readonly maxHistoryLength: number;

  public constructor(toxicBpsThreshold: number = 3.0, maxHistoryLength: number = 2000) {
    this.toxicBpsThreshold = toxicBpsThreshold;
    this.maxHistoryLength = maxHistoryLength;
  }

  public evaluateMarkout(
    tradeId: string,
    side: 'BUY' | 'SELL',
    executionPrice: number,
    markout10msPrice: number,
    markout100msPrice: number,
    markout1sPrice: number
  ): AdverseSelectionMarkout {
    // Loss to market maker if price moves adversely against MM position
    // If incoming order was BUY, MM sold at executionPrice: adverse move is price increasing.
    // If incoming order was SELL, MM bought at executionPrice: adverse move is price decreasing.
    const priceDiff =
      side === 'BUY'
        ? markout100msPrice - executionPrice
        : executionPrice - markout100msPrice;

    const shortHorizonLossBps = Number(((priceDiff / executionPrice) * 10000).toFixed(2));
    const isToxicFlow = shortHorizonLossBps >= this.toxicBpsThreshold;

    const record: AdverseSelectionMarkout = {
      tradeId,
      side,
      executionPrice,
      markout10msPrice,
      markout100msPrice,
      markout1sPrice,
      shortHorizonLossBps,
      isToxicFlow,
    };

    this.history.push(record);
    if (this.history.length > this.maxHistoryLength) {
      this.history.shift();
    }

    return record;
  }

  public getToxicFlowRatio(): number {
    if (this.history.length === 0) return 0;
    const toxicCount = this.history.filter((h) => h.isToxicFlow).length;
    return Number((toxicCount / this.history.length).toFixed(4));
  }

  public getAverageMarkoutLossBps(): number {
    if (this.history.length === 0) return 0;
    const total = this.history.reduce((sum, h) => sum + h.shortHorizonLossBps, 0);
    return Number((total / this.history.length).toFixed(2));
  }

  public getHistoryCount(): number {
    return this.history.length;
  }

  public clearHistory(): void {
    this.history.length = 0;
  }
}
