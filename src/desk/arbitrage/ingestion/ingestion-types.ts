/**
 * Opportunity Ingestion Pipeline Types
 * Configuration, telemetry metrics, and dependency injection interfaces for arbitrage ingestion.
 */

import type { SpreadDetector } from '../spread-detector';
import type { ArbitrageOpportunity } from '../spread-detector-types';
import type {
  NetProfitabilityCalculator,
  NetProfitabilityAnalysis,
} from '../net-profitability-calculator';

export interface IngestionPipelineConfig {
  symbols: string[];
  venues: string[];
  minHurdleBps: number; // Default: 10 (0.10%)
  baseNotionalUsd: number; // Default: 1000.00
  maxQueueSize: number; // Default: 50
  maxConcurrency: number; // Default: 3
  dedupTtlMs: number; // Default: 200ms
  dryRun: boolean; // Default: true
}

export type ArbitrageEngineConfig = IngestionPipelineConfig;

export interface IngestionMetrics {
  scannedCount: number;
  dedupDroppedCount: number;
  queueDroppedCount: number;
  admittedCount: number;
  rejectedCount: number;
}

export interface IngestionPipelineDeps {
  spreadDetector?: SpreadDetector;
  calculator?: NetProfitabilityCalculator;
  onAdmitted?: (opp: ArbitrageOpportunity, analysis: NetProfitabilityAnalysis) => Promise<void> | void;
  onRejected?: (
    opp: ArbitrageOpportunity,
    reason: string,
    analysis?: NetProfitabilityAnalysis
  ) => void;
}

export interface OpportunityEvaluationResult {
  passed: boolean;
  analysis: NetProfitabilityAnalysis;
  rejectionReason?: string;
}
