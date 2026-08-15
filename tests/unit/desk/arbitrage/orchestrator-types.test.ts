/**
 * Test orchestrator-types module exports
 */

import { describe, it, expect } from 'vitest';
import type {
  StrategyType,
  OrchestratorConfig,
  OrchestratorMetrics,
  QueuedOpportunity,
  OrchestratorContext,
} from '../../../../src/desk/arbitrage/orchestrator-types';

describe('orchestrator-types', () => {
  describe('StrategyType', () => {
    it('accepts valid strategy types', () => {
      const validStrategies: StrategyType[] = [
        'cross-exchange',
        'triangular',
        'dex-cex',
        'funding-rate',
        'binary-arb',
        'split-merge',
        'cross-market',
        'all',
      ];
      expect(validStrategies).toHaveLength(8);
    });
  });

  describe('OrchestratorConfig', () => {
    it('accepts required fields only', () => {
      const config: OrchestratorConfig = {
        symbols: ['BTC/USDT'],
        exchanges: ['binance'],
      };
      expect(config.symbols).toHaveLength(1);
      expect(config.exchanges).toHaveLength(1);
    });

    it('accepts optional fields', () => {
      const config: OrchestratorConfig = {
        symbols: ['BTC/USDT'],
        exchanges: ['binance'],
        minSpreadPercent: 0.1,
        checkIntervalMs: 100,
        maxLatencyMs: 500,
        maxQueueSize: 50,
        dryRun: true,
        verbose: true,
        strategy: 'cross-exchange',
      };
      expect(config.minSpreadPercent).toBe(0.1);
      expect(config.strategy).toBe('cross-exchange');
    });
  });

  describe('OrchestratorMetrics', () => {
    it('has all required fields', () => {
      const metrics: OrchestratorMetrics = {
        feedConnected: false,
        feedLatencyMs: 0,
        messagesReceived: 0,
        scansPerformed: 0,
        opportunitiesDetected: 0,
        p95DetectionLatencyMs: 0,
        signalsScored: 0,
        actionableSignals: 0,
        executionsAttempted: 0,
        executionsSucceeded: 0,
        executionsFailed: 0,
        totalProfit: 0,
        p95ExecutionLatencyMs: 0,
        queueSize: 0,
        queueDropped: 0,
        uptimeMs: 0,
        isRunning: false,
      };
      expect(metrics.feedConnected).toBe(false);
      expect(metrics.executionsFailed).toBe(0);
    });
  });

  describe('QueuedOpportunity', () => {
    it('has opportunity, score, and enqueuedAt', () => {
      const queued: QueuedOpportunity = {
        opportunity: {
          id: 'opp-1',
          type: 'cross-exchange',
          legs: [],
          expectedProfit: 0.05,
          expectedProfitPct: 0.5,
          totalFees: 0.01,
          confidence: 85,
          detectedAt: Date.now(),
          expiresAt: Date.now() + 5000,
        },
        score: {
          opportunity: { id: 'opp-1', symbol: 'BTC/USDT', buyExchange: 'binance', sellExchange: 'okx', buyPrice: 60000, sellPrice: 60010, spread: 10, spreadPercent: 0.017, timestamp: Date.now() },
          totalScore: 85,
          breakdown: { spreadScore: 90, latencyScore: 80, volumeScore: 85, reliabilityScore: 80 },
          rank: 1,
          recommendation: 'STRONG_BUY',
        },
        enqueuedAt: Date.now(),
      };
      expect(queued.opportunity.id).toBe('opp-1');
      expect(queued.score.totalScore).toBe(85);
    });
  });

  describe('OrchestratorContext', () => {
    it('has queue, queueDropped, config, and metrics', () => {
      const ctx: OrchestratorContext = {
        queue: [],
        queueDropped: 0,
        config: { maxQueueSize: 50 },
        metrics: {
          feedConnected: false,
          feedLatencyMs: 0,
          messagesReceived: 0,
          scansPerformed: 0,
          opportunitiesDetected: 0,
          p95DetectionLatencyMs: 0,
          signalsScored: 0,
          actionableSignals: 0,
          executionsAttempted: 0,
          executionsSucceeded: 0,
          executionsFailed: 0,
          totalProfit: 0,
          p95ExecutionLatencyMs: 0,
          queueSize: 0,
          queueDropped: 0,
          uptimeMs: 0,
          isRunning: false,
        },
      };
      expect(ctx.config.maxQueueSize).toBe(50);
      expect(ctx.queue).toHaveLength(0);
    });
  });
});
