/**
 * Unified Execution Engine - Validation & Error Handling Tests
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

describe('UnifiedExecutionEngine - Validation & Routing', () => {
  let engine: UnifiedExecutionEngine;

  beforeEach(() => {
    engine = new UnifiedExecutionEngine(defaultUnifiedConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('validate()', () => {
    it('should return true for valid cross-exchange opportunity', () => {
      expect(engine.validate(createMockOpportunity('cross-exchange'))).toBe(true);
    });

    it('should return true for valid binary-arb opportunity', () => {
      expect(engine.validate(createBinaryOpportunity())).toBe(true);
    });

    it('should return true for valid settlement-arb with required fields', () => {
      expect(engine.validate(createSplitMergeOpportunity())).toBe(true);
    });

    it('should return false for settlement-arb missing required fields', () => {
      expect(engine.validate(createMockOpportunity('settlement-arb'))).toBe(false);
    });

    it('should return false for cross-market without graph', () => {
      expect(engine.validate(createCrossMarketOpportunity())).toBe(false);
    });

    it('should return true for cross-market with graph', () => {
      const opp = createCrossMarketOpportunity();
      engine.setDependencyGraph({ nodes: [], edges: [] });
      expect(engine.validate(opp)).toBe(true);
    });
  });

  describe('getExecutor()', () => {
    it('should return executor for known types', () => {
      expect(engine.getExecutor('cross-exchange')).toBeDefined();
      expect(engine.getExecutor('binary-arb')).toBeDefined();
      expect(engine.getExecutor('settlement-arb')).toBeDefined();
      expect(engine.getExecutor('cross-market')).toBeDefined();
    });

    it('should return undefined for unknown types', () => {
      expect(engine.getExecutor('unknown')).toBeUndefined();
    });
  });

  describe('setDependencyGraph()', () => {
    it('should set graph for cross-market executor', () => {
      engine.setDependencyGraph({ nodes: ['m1', 'm2'], edges: [] });
      expect(engine.validate(createCrossMarketOpportunity())).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should return error result on execution failure', async () => {
      const opp = createMockOpportunity('settlement-arb');
      const result = await engine.execute(opp);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should increment error counter on failure', async () => {
      const opp = createMockOpportunity('settlement-arb');
      await engine.execute(opp);
      expect(engine.getMetrics().errors).toBe(1);
    });
  });
});
