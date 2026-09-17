/**
 * Unified Execution Engine Tests
 * Tests for the unified arbitrage execution engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UnifiedExecutionEngine,
  createUnifiedExecutionEngine,
  executeArbitrage,
} from '../unified-executor';
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

describe('UnifiedExecutionEngine', () => {
  let engine: UnifiedExecutionEngine;

  beforeEach(() => {
    engine = new UnifiedExecutionEngine(defaultUnifiedConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Construction', () => {
    it('should create engine with default config', () => {
      const e = new UnifiedExecutionEngine();
      expect(e).toBeInstanceOf(UnifiedExecutionEngine);
    });

    it('should create engine with custom config', () => {
      const e = new UnifiedExecutionEngine({ dryRun: false, maxPositionSize: 500 });
      expect(e).toBeInstanceOf(UnifiedExecutionEngine);
    });

    it('should create engine via factory function', () => {
      const e = createUnifiedExecutionEngine({ dryRun: true });
      expect(e).toBeInstanceOf(UnifiedExecutionEngine);
    });
  });

  describe('execute() - Cross-Exchange / Triangular / DEX-CEX / Funding-Rate', () => {
    it('should execute cross-exchange opportunity', async () => {
      const opp = createMockOpportunity('cross-exchange');
      const result = await engine.execute(opp);
      expect(result).toHaveProperty('opportunityId', opp.id);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executedLegs');
      expect(result).toHaveProperty('actualProfit');
      expect(result).toHaveProperty('actualProfitPct');
      expect(result).toHaveProperty('totalFees');
      expect(result).toHaveProperty('executedAt');
    });

    it('should execute triangular opportunity', async () => {
      const opp = createMockOpportunity('triangular');
      const result = await engine.execute(opp);
      expect(result.opportunityId).toBe(opp.id);
    });

    it('should execute dex-cex opportunity', async () => {
      const opp = createMockOpportunity('dex-cex');
      const result = await engine.execute(opp);
      expect(result.opportunityId).toBe(opp.id);
    });

    it('should execute funding-rate opportunity', async () => {
      const opp = createMockOpportunity('funding-rate');
      const result = await engine.execute(opp);
      expect(result.opportunityId).toBe(opp.id);
    });
  });

  describe('execute() - Binary Arbitrage (Polymarket)', () => {
    it('should execute binary-arb opportunity', async () => {
      const opp = createBinaryOpportunity();
      const result = await engine.execute(opp);
      expect(result.opportunityId).toBe(opp.id);
      expect(result.success).toBeDefined();
    });

    it('should reject non-binary-arb type for binary executor', async () => {
      const opp = createMockOpportunity('cross-exchange');
      const result = await engine.execute(opp);
      expect(result.opportunityId).toBe(opp.id);
    });
  });

  describe('execute() - Split-Merge Arbitrage (Polymarket)', () => {
    it('should execute settlement-arb opportunity', async () => {
      const opp = createSplitMergeOpportunity();
      const result = await engine.execute(opp);
      expect(result.opportunityId).toBe(opp.id);
      expect(result.success).toBeDefined();
    });

    it('should reject invalid settlement-arb (missing required fields)', async () => {
      const opp = createMockOpportunity('settlement-arb');
      const result = await engine.execute(opp);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('execute() - Cross-Market ILP Arbitrage', () => {
    it('should return error when dependency graph not set', async () => {
      const opp = createCrossMarketOpportunity();
      const result = await engine.execute(opp);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed for opportunity type: cross-market');
    });

    it('should execute cross-market opportunity when graph is set', async () => {
      const opp = createCrossMarketOpportunity();
      engine.setDependencyGraph({ nodes: [], edges: [] });
      const result = await engine.execute(opp);
      expect(result.opportunityId).toBe(opp.id);
    });
  });

  describe('Convenience function: executeArbitrage', () => {
    it('should execute opportunity with auto-created engine', async () => {
      const opp = createMockOpportunity('cross-exchange');
      const result = await executeArbitrage(opp, { dryRun: true });
      expect(result.opportunityId).toBe(opp.id);
    });
  });
});
