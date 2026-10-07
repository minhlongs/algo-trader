/**
 * Live Trading Pipeline Orchestrator
 * Wires MultiVenueMarketStreamer, CrossVenueArbDetector, PolymarketRelayerEngine,
 * GeneticEvolutionEngine, and EdgeCanaryDeploymentVerifier with full lifecycle controls.
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';
import { MultiVenueMarketStreamer, type UnifiedOrderBook } from '../data/multi-venue-market-streamer';
import { CrossVenueArbDetector, type CrossVenueArbOpportunity, type VenueQuote } from '../arbitrage/connectors/cross-venue-arb-detector';
import { PolymarketRelayerEngine, type RelayerOrderResponse } from '../polymarket/polymarket-relayer-engine';
import { GeneticEvolutionEngine } from '../../alpha-lab/alpha-discovery/genetic-evolution-engine';
import type { EvolutionSummary, FitnessEvaluator } from '../../alpha-lab/alpha-discovery/genetic-evolution-types';
import {
  EdgeCanaryDeploymentVerifier,
  type CanaryStage,
  type CanaryTelemetrySample,
  type CanaryVerificationVerdict,
} from '../execution/edge-canary-deployment-verifier';
import {
  DEFAULT_PIPELINE_GENETIC_CONFIG,
  type LiveTradingPipelineConfig,
  type PipelineMetrics,
  type PipelineEventHooks,
} from './live-trading-pipeline-types';
import { LiveTradingPipelineState } from './live-trading-pipeline-state';

export class LiveTradingPipelineOrchestrator extends EventEmitter {
  public readonly streamer: MultiVenueMarketStreamer;
  public readonly arbDetector: CrossVenueArbDetector;
  public readonly relayer?: PolymarketRelayerEngine;
  public readonly evolutionEngine: GeneticEvolutionEngine;
  public readonly canaryVerifier: EdgeCanaryDeploymentVerifier;

  private readonly state: LiveTradingPipelineState;
  private readonly config: LiveTradingPipelineConfig;
  private readonly hooks: PipelineEventHooks;

  constructor(config: LiveTradingPipelineConfig = {}, hooks: PipelineEventHooks = {}) {
    super();
    this.config = config;
    this.hooks = hooks;
    this.state = new LiveTradingPipelineState(config.initialCanaryStage ?? 0);

    this.streamer = new MultiVenueMarketStreamer(config.streamerConfig, config.wsFactory);
    this.arbDetector = new CrossVenueArbDetector(config.arbConfig);
    if (config.relayerPrivateKey) {
      this.relayer = new PolymarketRelayerEngine(config.relayerPrivateKey, config.relayerConfig);
    }
    this.evolutionEngine = new GeneticEvolutionEngine(config.evolutionConfig ?? DEFAULT_PIPELINE_GENETIC_CONFIG);
    this.canaryVerifier = new EdgeCanaryDeploymentVerifier(config.canaryCriteria, config.canaryRollbackHook);

    this.streamer.on('orderbook', (book: UnifiedOrderBook) => {
      this.emit('orderbook', book);
    });
  }

  public async start(): Promise<void> {
    if (this.state.status === 'running') return;
    try {
      this.state.status = 'running';
      this.state.startedAt = Date.now();
      await this.streamer.start();
      if (this.config.trackedVenues && this.config.trackedSymbols) {
        for (const venue of this.config.trackedVenues) {
          for (const symbol of this.config.trackedSymbols) {
            this.streamer.subscribe(venue, symbol);
          }
        }
      }
      logger.info('[LiveTradingPipeline] Orchestrator started successfully');
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)), 'start');
      throw err;
    }
  }

  public pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      logger.info('[LiveTradingPipeline] Orchestrator paused');
    }
  }

  public resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      logger.info('[LiveTradingPipeline] Orchestrator resumed');
    }
  }

  public stop(): void {
    this.streamer.stop();
    this.state.status = 'stopped';
    logger.info('[LiveTradingPipeline] Orchestrator stopped');
  }

  public async evaluateAndExecuteArb(quoteA: VenueQuote, quoteB: VenueQuote): Promise<CrossVenueArbOpportunity[]> {
    if (this.state.status !== 'running') return [];
    try {
      const opps = this.arbDetector.evaluatePair(quoteA, quoteB, this.config.maxNotionalUsd ?? 1000);
      for (const opp of opps) {
        this.state.opportunitiesDetected++;
        this.emit('opportunity', opp);
        this.hooks.onOpportunity?.(opp);

        if (opp.isViable && this.config.autoExecuteArb && this.relayer && (opp.buyVenue === 'polymarket' || opp.sellVenue === 'polymarket')) {
          await this.executeRelayerOrderForArb(opp);
        }
      }
      return opps;
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)), 'evaluateAndExecuteArb');
      return [];
    }
  }

  private async executeRelayerOrderForArb(opp: CrossVenueArbOpportunity): Promise<RelayerOrderResponse | null> {
    if (!this.relayer) return null;
    this.state.ordersRelayed++;
    try {
      const side = opp.buyVenue === 'polymarket' ? 'BUY' : 'SELL';
      const price = opp.buyVenue === 'polymarket' ? opp.buyPrice : opp.sellPrice;
      const signed = await this.relayer.buildAndSignOrder({
        tokenId: opp.symbol,
        price,
        size: opp.maxVolume,
        side,
      });
      const res = await this.relayer.submitRelayerOrder(signed);
      if (res.status !== 'FAILED') this.state.successfulOrders++;
      else this.state.failedOrders++;
      this.emit('orderSubmitted', res);
      this.hooks.onOrderSubmitted?.(res);
      return res;
    } catch (err) {
      this.state.failedOrders++;
      this.handleError(err instanceof Error ? err : new Error(String(err)), 'executeRelayerOrderForArb');
      return null;
    }
  }

  public recordTelemetry(sample: CanaryTelemetrySample, isBaseline = false): void {
    this.state.recordTelemetry(sample, isBaseline);
  }

  public async verifyCanaryStage(targetStage?: CanaryStage): Promise<CanaryVerificationVerdict> {
    const stage = targetStage ?? this.state.activeCanaryStage;
    try {
      const verdict = await this.canaryVerifier.verifyStage(stage, this.state.canarySamples, this.state.baselineSamples);
      this.state.lastVerdict = verdict;
      if (verdict.passed) this.state.activeCanaryStage = verdict.nextRecommendedStage;
      this.emit('canaryVerdict', verdict);
      this.hooks.onCanaryVerdict?.(verdict);
      return verdict;
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)), 'verifyCanaryStage');
      throw err;
    }
  }

  public async runEvolutionCycle(evaluator: FitnessEvaluator, familyId: string): Promise<EvolutionSummary> {
    try {
      const summary = await this.evolutionEngine.evolve(familyId, evaluator);
      this.state.evolutionCycles++;
      this.emit('evolutionCycle', summary);
      this.hooks.onEvolutionCycle?.(summary);
      return summary;
    } catch (err) {
      this.handleError(err instanceof Error ? err : new Error(String(err)), 'runEvolutionCycle');
      throw err;
    }
  }

  public getMetrics(): PipelineMetrics {
    return this.state.getMetrics();
  }

  private handleError(err: Error, context: string): void {
    this.state.recordError(err, context);
    logger.error(`[LiveTradingPipeline] Error in ${context}: ${err.message}`, { error: err.stack });
    this.emit('error', err, context);
    this.hooks.onError?.(err, context);
  }
}
