/**
 * Desk Harmonizer Pipeline Engine
 * State-machine driving closed-loop quantitative alpha, quoting, routing, and LVR hedging.
 *
 * @module desk/harmonizer/desk-harmonizer-pipeline
 */

import { LeadLagAlphaPredictor } from '../signal/lead-lag-alpha-predictor';
import { VpinToxicFlowClassifier } from '../risk/vpin-toxic-flow-classifier';
import { DeskSignalAggregator } from './desk-signal-aggregator';
import { AsQuoteModulator } from './as-quote-modulator';
import { BundleExecutionCoordinator } from './bundle-execution-coordinator';
import { LvrHedgeSynchronizer } from './lvr-hedge-synchronizer';
import type {
  DeskHarmonizerConfig,
  HarmonizedDeskDecision,
  HarmonizerCycleInput,
  HarmonizerState,
} from './desk-harmonizer-types';

export class DeskHarmonizerPipeline {
  private readonly predictor: LeadLagAlphaPredictor;
  private readonly classifier: VpinToxicFlowClassifier;
  private readonly aggregator = new DeskSignalAggregator();
  private readonly modulator = new AsQuoteModulator();
  private readonly coordinator: BundleExecutionCoordinator;
  private readonly synchronizer = new LvrHedgeSynchronizer();
  private readonly config: DeskHarmonizerConfig;

  public constructor(config: DeskHarmonizerConfig = {}) {
    this.config = config;
    this.predictor = new LeadLagAlphaPredictor();
    this.classifier = new VpinToxicFlowClassifier({
      toxicThreshold: config.toxicVpinThreshold ?? 0.65,
    });
    this.coordinator = new BundleExecutionCoordinator(config.maxSkewTolerance ?? 0.05);
  }

  public getPredictor(): LeadLagAlphaPredictor {
    return this.predictor;
  }

  public getClassifier(): VpinToxicFlowClassifier {
    return this.classifier;
  }

  public executeCycle(input: HarmonizerCycleInput): HarmonizedDeskDecision {
    let state: HarmonizerState = 'EVALUATING_FLOW';

    // 1. Synthesize predictive alpha + microstructure toxicity
    const signals = this.aggregator.aggregate(
      this.predictor,
      this.classifier,
      input.leadVenue,
      input.lagVenue,
      input.symbol,
      input.marketId,
      input.timestampMs
    );

    // 2. Select state posture
    if (signals.isAdverseSelectionImminent) {
      state = 'DEFENSIVE_WIDEN';
    } else {
      state = 'QUOTING_ACTIVE';
    }

    // 3. Compute modulated Avellaneda-Stoikov quotes
    const quotes = this.modulator.computeModulatedQuotes({
      marketId: input.marketId,
      midPrice: input.currentMidPrice,
      netInventory: input.netInventory,
      timeToExpirySec: input.timeToExpirySec,
      signals,
      baseGamma: this.config.baseRiskAversionGamma ?? 0.20,
      maxAbsInventory: this.config.maxAbsInventory ?? 2000,
      baseOrderSize: this.config.baseOrderSize ?? 100,
    });

    return {
      marketId: input.marketId,
      state,
      alphaSignal: signals.alphaSignal,
      toxicity: signals.toxicity,
      quotes,
      recommendedDeltaHedgeUnits: 0,
      defensiveSpreadMultiplier: signals.spreadMultiplier,
      timestampMs: input.timestampMs,
    };
  }
}
