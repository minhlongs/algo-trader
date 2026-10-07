/**
 * Adverse Selection Guard
 *
 * Evaluates VPIN and Order Flow Imbalance (OFI) metrics from microstructure feeds
 * to defend liquidity providers from informed traders and adverse selection.
 *
 * @module desk/risk/adverse-selection-guard
 */

import { EventEmitter } from 'events';
import type { AdverseSelectionConfig, ToxicFlowAssessment } from './adverse-selection-types';

export class AdverseSelectionGuard extends EventEmitter {
  private readonly config: AdverseSelectionConfig;

  constructor(config?: Partial<AdverseSelectionConfig>) {
    super();
    this.config = {
      vpinWarningThreshold: config?.vpinWarningThreshold ?? 0.40,
      vpinCriticalThreshold: config?.vpinCriticalThreshold ?? 0.65,
      maxSpreadMultiplier: config?.maxSpreadMultiplier ?? 3.0,
      sensitivityFactor: config?.sensitivityFactor ?? 4.0,
    };
  }

  public assessMarket(params: {
    marketId: string;
    vpin: number;
    ofi: number;
    timestamp?: number;
  }): ToxicFlowAssessment {
    const { marketId, vpin, ofi } = params;
    const timestamp = params.timestamp ?? Date.now();

    let state: 'NORMAL' | 'ELEVATED' | 'TOXIC' = 'NORMAL';
    let shouldCancelQuotes = false;
    let spreadMultiplier = 1.0;

    if (vpin >= this.config.vpinCriticalThreshold) {
      state = 'TOXIC';
      shouldCancelQuotes = true;
      spreadMultiplier = this.config.maxSpreadMultiplier;
    } else if (vpin >= this.config.vpinWarningThreshold) {
      state = 'ELEVATED';
      const excessVpin = vpin - this.config.vpinWarningThreshold;
      const calculatedMultiplier = 1.0 + excessVpin * this.config.sensitivityFactor;
      spreadMultiplier = Math.min(this.config.maxSpreadMultiplier, calculatedMultiplier);
    }

    const assessment: ToxicFlowAssessment = {
      marketId,
      vpin,
      ofi,
      spreadMultiplier: Math.round(spreadMultiplier * 100) / 100,
      shouldCancelQuotes,
      state,
      timestamp,
    };

    if (state === 'TOXIC') {
      this.emit('toxicFlowAlert', assessment);
    } else if (state === 'ELEVATED') {
      this.emit('elevatedRisk', assessment);
    }

    return assessment;
  }
}
