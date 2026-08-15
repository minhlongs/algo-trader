/**
 * Strategy Orchestrator Types
 * Extracted from orchestrator.ts for single-responsibility compliance
 */

import type { ExecutionResult, ExchangeId } from './types';
import type { SignalScore, SignalScorer } from './signal-scorer';
import type { ArbitrageOpportunity } from './types';
import type { SpreadDetector } from './spread-detector';
import type { UnifiedExecutionEngine } from './unified-executor';

export type StrategyType =
  | 'cross-exchange'
  | 'triangular'
  | 'dex-cex'
  | 'funding-rate'
  | 'binary-arb'
  | 'split-merge'
  | 'cross-market'
  | 'all';

export interface OrchestratorConfig {
  symbols: string[];
  exchanges: string[];
  minSpreadPercent?: number;
  checkIntervalMs?: number;
  maxLatencyMs?: number;
  scoreWeights?: {
    spread: number;
    latency: number;
    volume: number;
    reliability: number;
  };
  scoreThresholds?: {
    strongBuy: number;
    buy: number;
    hold: number;
  };
  executionConfig?: {
    dryRun?: boolean;
  };
  maxQueueSize?: number;
  dryRun?: boolean;
  verbose?: boolean;
  strategy?: StrategyType;
  minSignalScore?: number;
}

export interface OrchestratorMetrics {
  // Feed
  feedConnected: boolean;
  feedLatencyMs: number;
  messagesReceived: number;

  // Detection
  scansPerformed: number;
  opportunitiesDetected: number;
  p95DetectionLatencyMs: number;

  // Signal
  signalsScored: number;
  actionableSignals: number;

  // Execution
  executionsAttempted: number;
  executionsSucceeded: number;
  executionsFailed: number;
  totalProfit: number;
  p95ExecutionLatencyMs: number;

  // Queue
  queueSize: number;
  queueDropped: number;

  // General
  uptimeMs: number;
  isRunning: boolean;
}

export interface QueuedOpportunity {
  opportunity: ArbitrageOpportunity;
  score: SignalScore;
  enqueuedAt: number;
}

export interface OrchestratorContext {
  /** Whether the orchestrator loop is active */
  running: boolean;
  config: OrchestratorConfig;
  spreadDetector: SpreadDetector;
  signalScorer: SignalScorer;
  executionEngine: UnifiedExecutionEngine;
  metrics: OrchestratorMetrics;
  detectionLatencies: number[];
  executionLatencies: number[];
  queue: QueuedOpportunity[];
  queueDropped: number;
}
