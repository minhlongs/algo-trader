/**
 * Orchestrator Conversion Utilities
 * Converts between spread-detector format and unified ArbitrageOpportunity
 * Pure functions - no side effects
 */

import type { ArbitrageOpportunity, ArbitrageLeg, ExchangeId } from './types';
import type { ArbitrageOpportunity as SpreadArbitrageOpportunity } from './spread-detector';
import type { OrchestratorMetrics } from './orchestrator-types';
import type { FeedAggregator, ExchangeId as FeedExchangeId } from '../feeds/feed-aggregator';

/**
 * Convert SpreadDetector opportunity to unified ArbitrageOpportunity format
 */
export function convertToUnifiedOpportunity(spreadOpp: SpreadArbitrageOpportunity): ArbitrageOpportunity {
  const legs: ArbitrageLeg[] = [
    {
      exchange: spreadOpp.buyExchange as ExchangeId,
      symbol: spreadOpp.symbol,
      side: 'buy',
      price: spreadOpp.buyPrice,
      amount: 1000 / spreadOpp.buyPrice,
      fee: spreadOpp.fees?.buyFee ?? 0,
    },
    {
      exchange: spreadOpp.sellExchange as ExchangeId,
      symbol: spreadOpp.symbol,
      side: 'sell',
      price: spreadOpp.sellPrice,
      amount: 1000 / spreadOpp.sellPrice,
      fee: spreadOpp.fees?.sellFee ?? 0,
    },
  ];

  return {
    id: spreadOpp.id,
    type: 'cross-exchange',
    legs,
    expectedProfit: spreadOpp.spread,
    expectedProfitPct: spreadOpp.spreadPercent,
    totalFees: (spreadOpp.fees?.buyFee ?? 0) + (spreadOpp.fees?.sellFee ?? 0),
    confidence: confidenceToNumeric(spreadOpp.confidence ?? 'medium'),
    detectedAt: spreadOpp.timestamp,
    expiresAt: spreadOpp.timestamp + 5000,
  };
}

/**
 * Convert confidence string to numeric value (0-100)
 */
export function confidenceToNumeric(confidence: 'high' | 'medium' | 'low' | undefined): number {
  switch (confidence) {
    case 'high': return 95;
    case 'medium': return 70;
    case 'low': return 40;
    default: return 50;
  }
}

/**
 * Check if an opportunity matches the configured strategy filter
 */
export function matchesStrategyFilter(
  opportunity: ArbitrageOpportunity,
  strategy: string
): boolean {
  if (strategy === 'all') return true;
  if (strategy === 'cross-exchange' && opportunity.type === 'cross-exchange') return true;
  if (strategy === 'triangular' && opportunity.type === 'triangular') return true;
  if (strategy === 'dex-cex' && opportunity.type === 'dex-cex') return true;
  if (strategy === 'funding-rate' && opportunity.type === 'funding-rate') return true;
  if (strategy === 'binary-arb' && opportunity.type === 'binary-arb') return true;
  if (strategy === 'split-merge' && opportunity.type === 'settlement-arb') return true;
  if (strategy === 'cross-market' && opportunity.type === 'cross-market') return true;
  return false;
}

/**
 * Calculate p95 value from a set of latency samples.
 */
export function calculateP95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Compute orchestrator metrics from live state.
 * Called by StrategyOrchestrator.getMetrics() to delegate metric computation.
 */
export function computeMetrics(
  feedAggregator: FeedAggregator,
  symbols: string[],
  exchanges: string[],
  metrics: OrchestratorMetrics,
  detectionLatencies: number[],
  executionLatencies: number[],
): void {
  let totalLatency = 0;
  let latencyCount = 0;
  for (const exchange of exchanges) {
    for (const symbol of symbols) {
      const lat = feedAggregator.getAverageLatency(exchange as unknown as FeedExchangeId, symbol);
      if (lat > 0) {
        totalLatency += lat;
        latencyCount++;
      }
    }
  }
  metrics.feedLatencyMs = latencyCount > 0 ? totalLatency / latencyCount : 0;
  metrics.p95DetectionLatencyMs = calculateP95(detectionLatencies);
  metrics.p95ExecutionLatencyMs = calculateP95(executionLatencies);
}
