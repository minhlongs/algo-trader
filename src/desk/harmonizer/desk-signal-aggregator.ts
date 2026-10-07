/**
 * Desk Signal Aggregator
 * Synthesizes Hayashi-Yoshida cross-correlation drift and VPIN toxicity classifications.
 *
 * @module desk/harmonizer/desk-signal-aggregator
 */

import type { LeadLagAlphaPredictor } from '../signal/lead-lag-alpha-predictor';
import type { LeadLagAlphaSignal } from '../signal/lead-lag-alpha-types';
import type { VpinToxicFlowClassifier } from '../risk/vpin-toxic-flow-classifier';
import type { VpinToxicityMetrics } from '../risk/vpin-toxic-flow-types';

export interface AggregatedDeskSignals {
  readonly alphaSignal: LeadLagAlphaSignal;
  readonly toxicity: VpinToxicityMetrics;
  readonly adjustedDriftBps: number;
  readonly isAdverseSelectionImminent: boolean;
  readonly spreadMultiplier: number;
}

export class DeskSignalAggregator {
  public aggregate(
    predictor: LeadLagAlphaPredictor,
    classifier: VpinToxicFlowClassifier,
    leadVenue: string,
    lagVenue: string,
    symbol: string,
    marketId: string,
    timestampMs: number
  ): AggregatedDeskSignals {
    const alphaSignal = predictor.predictAlpha(leadVenue, lagVenue, symbol, timestampMs);
    const toxicity = classifier.evaluateMarketToxicity(marketId, timestampMs);

    // If flow is toxic, dampen directional drift confidence and widen spread
    const confidenceDampener = toxicity.isAdverseSelectionImminent ? 0.30 : 1.0;
    const adjustedDriftBps = Math.round(alphaSignal.expectedPriceDriftBps * confidenceDampener);

    return {
      alphaSignal,
      toxicity,
      adjustedDriftBps,
      isAdverseSelectionImminent: toxicity.isAdverseSelectionImminent,
      spreadMultiplier: toxicity.recommendedSpreadMultiplier,
    };
  }
}
