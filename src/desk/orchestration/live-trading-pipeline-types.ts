/**
 * Live Trading Pipeline Orchestration Types
 * Strict typing for live pipeline execution, state transitions, metrics, and event hooks.
 */

import type { SupportedVenue, StreamerConfig, WebSocketFactory } from '../data/multi-venue-market-streamer';
import type { CrossVenueArbConfig, CrossVenueArbOpportunity } from '../arbitrage/connectors/cross-venue-arb-detector';
import type { RelayerConfig, RelayerOrderResponse } from '../polymarket/polymarket-relayer-engine';
import type { GeneticAlgorithmConfig, EvolutionSummary } from '../../alpha-lab/alpha-discovery/genetic-evolution-types';
import type { CanaryStage, CanaryVerificationCriteria, CanaryTelemetrySample, CanaryVerificationVerdict } from '../execution/edge-canary-deployment-verifier';
import type { RollbackLayer } from '../../rollback/rollback-types';

export type PipelineStatus = 'uninitialized' | 'idle' | 'running' | 'paused' | 'stopped' | 'error';

export const DEFAULT_PIPELINE_GENETIC_CONFIG: GeneticAlgorithmConfig = {
  populationSize: 20,
  generations: 5,
  paramBounds: { spreadThresholdBps: { min: 5, max: 100, step: 1 } },
  gateConfig: { minDsr: 0.8, minSharpe: 1.0, maxComplexity: 5 },
  crossoverConfig: { crossoverRate: 0.8, distributionIndexEta: 20 },
  mutationConfig: { mutationRate: 0.1, gaussianSigma: 0.05 },
  fitnessWeights: { sharpeWeight: 0.4, sortinoWeight: 0.3, dsrWeight: 0.2, complexityWeight: 0.1 },
  tournamentSizeK: 3,
  eliteCount: 2,
};

export interface LiveTradingPipelineConfig {
  streamerConfig?: StreamerConfig;
  wsFactory?: WebSocketFactory;
  arbConfig?: Partial<CrossVenueArbConfig>;
  relayerPrivateKey?: string;
  relayerConfig?: RelayerConfig;
  evolutionConfig?: GeneticAlgorithmConfig;
  canaryCriteria?: CanaryVerificationCriteria;
  canaryRollbackHook?: (layer: RollbackLayer, reason: string, meta?: Record<string, unknown>) => Promise<void> | void;
  maxNotionalUsd?: number;
  autoExecuteArb?: boolean;
  initialCanaryStage?: CanaryStage;
  trackedSymbols?: string[];
  trackedVenues?: SupportedVenue[];
}

export interface PipelineMetrics {
  status: PipelineStatus;
  startedAt?: number;
  uptimeMs: number;
  opportunitiesDetected: number;
  ordersRelayed: number;
  successfulOrders: number;
  failedOrders: number;
  evolutionCycles: number;
  activeCanaryStage: CanaryStage;
  lastVerdict?: CanaryVerificationVerdict;
  totalTelemetrySamples: number;
  errorsCount: number;
  lastError?: string;
}

export interface PipelineEventHooks {
  onOpportunity?: (opp: CrossVenueArbOpportunity) => void;
  onOrderSubmitted?: (res: RelayerOrderResponse) => void;
  onEvolutionCycle?: (summary: EvolutionSummary) => void;
  onCanaryVerdict?: (verdict: CanaryVerificationVerdict) => void;
  onError?: (err: Error, context?: string) => void;
}

export interface ArbitrageExecutionRequest {
  opportunity: CrossVenueArbOpportunity;
  tokenId?: string;
  customSize?: number;
  customPrice?: number;
}
