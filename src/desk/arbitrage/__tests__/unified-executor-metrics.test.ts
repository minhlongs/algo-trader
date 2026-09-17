/**
 * Unified Execution Engine - Metrics, Audit Log, Reset, Integration Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnifiedExecutionEngine } from '../unified-executor';
import {
  createMockOpportunity,
  createBinaryOpportunity,
  createSplitMergeOpportunity,
  createCrossMarketOpportunity,
  defaultUnifiedConfig,
} from './unified-executor-fixtures';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('UnifiedExecutionEngine - Metrics & Audit', () => {
  let engine: UnifiedExecutionEngine;

  beforeEach(() => {
    engine = new UnifiedExecutionEngine(defaultUnifiedConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getMetrics()', () => {
    it('should return global metrics', () => {
      const metrics = engine.getMetrics();
      expect(metrics).toHaveProperty('opportunitiesReceived');
      expect(metrics).toHaveProperty('opportunitiesExecuted');
      expect(metrics).toHaveProperty('totalProfit');
      expect(metrics).toHaveProperty('avgLatencyMs');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('perStrategy');
    });

    it('should return per-strategy metrics', () => {
      const metrics = engine.getMetrics();
      expect(metrics.perStrategy).toHaveProperty('cross-exchange');
      expect(metrics.perStrategy).toHaveProperty('triangular');
      expect(metrics.perStrategy).toHaveProperty('dex-cex');
      expect(metrics.perStrategy).toHaveProperty('funding-rate');
      expect(metrics.perStrategy).toHaveProperty('binary-arb');
      expect(metrics.perStrategy).toHaveProperty('settlement-arb');
      expect(metrics.perStrategy).toHaveProperty('cross-market');
    });

    it('should track metrics after execution', async () => {
      const opp = createMockOpportunity('cross-exchange');
      await engine.execute(opp);
      expect(engine.getMetrics().opportunitiesReceived).toBe(1);
    });
  });

  describe('Audit Log', () => {
    it('should record audit entries', async () => {
      const opp = createMockOpportunity('cross-exchange');
      await engine.execute(opp);
      const auditLog = engine.getAuditLog();
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].opportunityId).toBe(opp.id);
      expect(auditLog[0].type).toBe('cross-exchange');
    });

    it('should limit audit log via argument', async () => {
      const auditLog = engine.getAuditLog(50);
      expect(Array.isArray(auditLog)).toBe(true);
    });
  });

  describe('resetMetrics()', () => {
    it('should reset all metrics', async () => {
      const opp = createMockOpportunity('cross-exchange');
      await engine.execute(opp);
      engine.resetMetrics();
      const metrics = engine.getMetrics();
      expect(metrics.opportunitiesReceived).toBe(0);
      expect(metrics.opportunitiesExecuted).toBe(0);
      expect(metrics.totalProfit).toBe(0);
      expect(metrics.errors).toBe(0);
    });
  });

  describe('Latency tracking', () => {
    it('should track average latency', async () => {
      const opp = createMockOpportunity('cross-exchange');
      await engine.execute(opp);
      await engine.execute(createMockOpportunity('cross-exchange'));
      expect(engine.getMetrics().avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration', () => {
    it('should handle all strategy types in sequence', async () => {
      engine.setDependencyGraph({ nodes: ['m1'], edges: [] });
      const results = await Promise.all([
        engine.execute(createMockOpportunity('cross-exchange')),
        engine.execute(createMockOpportunity('triangular')),
        engine.execute(createMockOpportunity('dex-cex')),
        engine.execute(createMockOpportunity('funding-rate')),
        engine.execute(createBinaryOpportunity()),
        engine.execute(createSplitMergeOpportunity()),
        engine.execute(createCrossMarketOpportunity()),
      ]);
      expect(results.length).toBe(7);
      results.forEach((result) => {
        expect(result.opportunityId).toBeDefined();
      });
    });

    it('should aggregate metrics across all strategies', async () => {
      engine.setDependencyGraph({ nodes: ['m1'], edges: [] });
      await engine.execute(createMockOpportunity('cross-exchange'));
      await engine.execute(createBinaryOpportunity());
      await engine.execute(createSplitMergeOpportunity());
      await engine.execute(createCrossMarketOpportunity());
      const metrics = engine.getMetrics();
      expect(metrics.opportunitiesReceived).toBe(4);
      expect(Object.keys(metrics.perStrategy).length).toBe(7);
    });
  });
});
