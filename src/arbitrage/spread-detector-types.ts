/**
 * Spread Detector Types & Interfaces
 * Shared type definitions for the arbitrage spread detection system.
 */

export interface ArbitrageOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  timestamp: number;
  latency: number;
  score?: number;
  confidence?: 'high' | 'medium' | 'low';
  fees?: { buyFee: number; sellFee: number; netFee: number };
  slippage?: { buySlippage: number; sellSlippage: number; totalSlippage: number };
}

export interface SpreadConfig {
  minSpreadPercent: number;
  maxLatencyMs: number;
  checkIntervalMs: number;
  enableMLScoring: boolean;
  enableLatencyOptimization: boolean;
  cacheTTL: number;
  parallelBatchSize: number;
}

export interface ExchangeLatency {
  exchange: string;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  successRate: number;
  lastUpdate: number;
}

export interface PriceCacheEntry {
  bid: number;
  ask: number;
  timestamp: number;
  exchange: string;
  symbol: string;
  latency: number;
}

export interface ScoringModel {
  weights: {
    spreadWeight: number;
    liquidityWeight: number;
    latencyWeight: number;
    volatilityWeight: number;
  };
  thresholds: {
    minScore: number;
    highConfidenceScore: number;
  };
}
