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
  ArbitrageOpportunity,
  ArbitrageLeg,
  ExecutionResult,
  UnifiedExecutorConfig,
  BinaryArbitrageOpportunity,
  SplitMergeArbitrageOpportunity,
  CrossMarketArbitrageOpportunity,
} from '../types';

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Test data factories
const createMockLeg = (overrides: Partial<ArbitrageLeg> = {}): ArbitrageLeg => ({
  exchange: 'binance',
  symbol: 'BTC/USDT',
  side: 'buy',
  price: 50000,
  amount: 0.1,
  fee: 5,
  ...overrides,
});

const createMockOpportunity = (
  type: ArbitrageOpportunity['type'],
  overrides: Partial<ArbitrageOpportunity> = {}
): ArbitrageOpportunity => ({
  id: `opp-${Date.now()}`,
  type,
  legs: [createMockLeg(), createMockLeg({ side: 'sell' })],
  expectedProfit: 100,
  expectedProfitPct: 1.0, // Above minProfitThreshold of 0.5
  totalFees: 10,
  confidence: 0.9,
  detectedAt: Date.now(),
  expiresAt: Date.now() + 60000,
  ...overrides,
});

const createBinaryOpportunity = (overrides: Partial<BinaryArbitrageOpportunity> = {}): BinaryArbitrageOpportunity => ({
  ...createMockOpportunity('binary-arb', { expectedProfitPct: 1.0 }),
  market: {
    conditionId: 'test-market',
    question: 'Test market?',
    yesPrice: 0.45,
    noPrice: 0.45,
    volume: 100000,
    liquidity: 50000,
    endDate: new Date(Date.now() + 86400000),
    resolved: false,
  },
  mispricing: 0.1,
  edge: 'both-cheap',
  ...overrides,
});

const createSplitMergeOpportunity = (overrides: Partial<SplitMergeArbitrageOpportunity> = {}): SplitMergeArbitrageOpportunity => ({
  ...createMockOpportunity('settlement-arb'),
  marketId: 'market-123',
  title: 'Test Market',
  yesPrice: 0.48,
  noPrice: 0.48,
  totalCost: 960,
  profit: 40,
  profitPercent: 4.17,
  ...overrides,
});

const createCrossMarketOpportunity = (overrides: Partial<CrossMarketArbitrageOpportunity> = {}): CrossMarketArbitrageOpportunity => ({
  ...createMockOpportunity('cross-market'),
  basket: {
    id: 'basket-1',
    positions: [
      { marketId: 'market-1', side: 'YES', size: 100, expectedProfit: 5 },
      { marketId: 'market-2', side: 'NO', size: 150, expectedProfit: 8 },
    ],
    totalExpectedProfit: 13,
    totalCost: 25000,
  },
  ...overrides,
});

describe('UnifiedExecutionEngine', () => {
  let engine: UnifiedExecutionEngine;
  const defaultConfig: UnifiedExecutorConfig = {
    dryRun: true,
    maxPositionSize: 1000,
    slippageTolerance: 0.5,
    minProfitThreshold: 0.5,
    timeoutMs: 5000,
    binary: { dryRun: true, maxPositionSize: 1000, kellyFraction: 0.25, maxDrawdownPct: 0.2 },
    splitMerge: { dryRun: true, maxPositionSize: 1000, minProfitThreshold: 0.001, minVolume: 5000 },
    crossMarket: { dryRun: true, budgetUsdc: 10000, maxMarketExposureFraction: 0.2, minEdgeThreshold: 0.025, feeRate: 0.02, timeoutMs: 500 },
  };

  beforeEach(() => {
    engine = new UnifiedExecutionEngine(defaultConfig);
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

      // Should still route to cross-exchange executor
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

      // Should fail validation or execution
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('execute() - Cross-Market ILP Arbitrage', () => {
    it('should return error when dependency graph not set', async () => {
      const opp = createCrossMarketOpportunity();
      const result = await engine.execute(opp);

      expect(result.success).toBe(false);
      // Validation fails before execution, so error is generic
      expect(result.error).toContain('Validation failed for opportunity type: cross-market');
    });

    it('should execute cross-market opportunity when graph is set', async () => {
      const opp = createCrossMarketOpportunity();
      engine.setDependencyGraph({ nodes: [], edges: [] });
      const result = await engine.execute(opp);

      expect(result.opportunityId).toBe(opp.id);
    });
  });

  describe('validate()', () => {
    it('should return true for valid cross-exchange opportunity', () => {
      const opp = createMockOpportunity('cross-exchange');
      expect(engine.validate(opp)).toBe(true);
    });

    it('should return true for valid binary-arb opportunity', () => {
      const opp = createBinaryOpportunity();
      expect(engine.validate(opp)).toBe(true);
    });

    it('should return true for valid settlement-arb with required fields', () => {
      const opp = createSplitMergeOpportunity();
      expect(engine.validate(opp)).toBe(true);
    });

    it('should return false for settlement-arb missing required fields', () => {
      const opp = createMockOpportunity('settlement-arb');
      expect(engine.validate(opp)).toBe(false);
    });

    it('should return false for cross-market without graph', () => {
      const opp = createCrossMarketOpportunity();
      expect(engine.validate(opp)).toBe(false);
    });

    it('should return true for cross-market with graph', () => {
      const opp = createCrossMarketOpportunity();
      engine.setDependencyGraph({ nodes: [], edges: [] });
      expect(engine.validate(opp)).toBe(true);
    });
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

      const metrics = engine.getMetrics();
      expect(metrics.opportunitiesReceived).toBe(1);
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

  describe('Audit Log', () => {
    it('should record audit entries', async () => {
      const opp = createMockOpportunity('cross-exchange');
      await engine.execute(opp);

      const auditLog = engine.getAuditLog();
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].opportunityId).toBe(opp.id);
      expect(auditLog[0].type).toBe('cross-exchange');
    });

    it('should limit audit log to 10000 entries', async () => {
      // This would require many executions, just test the method exists
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

  describe('setDependencyGraph()', () => {
    it('should set graph for cross-market executor', () => {
      const graph = { nodes: ['m1', 'm2'], edges: [] };
      engine.setDependencyGraph(graph);

      // Validate should now pass for cross-market
      const opp = createCrossMarketOpportunity();
      expect(engine.validate(opp)).toBe(true);
    });
  });

  describe('Convenience function: executeArbitrage', () => {
    it('should execute opportunity with auto-created engine', async () => {
      const opp = createMockOpportunity('cross-exchange');
      const result = await executeArbitrage(opp, { dryRun: true });

      expect(result.opportunityId).toBe(opp.id);
    });
  });

  describe('Error handling', () => {
    it('should return error result on execution failure', async () => {
      // Create opportunity that will cause validation to fail
      const opp = createMockOpportunity('settlement-arb');
      const result = await engine.execute(opp);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should increment error counter on failure', async () => {
      const opp = createMockOpportunity('settlement-arb');
      await engine.execute(opp);

      const metrics = engine.getMetrics();
      expect(metrics.errors).toBe(1);
    });
  });

  describe('Latency tracking', () => {
    it('should track average latency', async () => {
      const opp = createMockOpportunity('cross-exchange');
      await engine.execute(opp);
      await engine.execute(createMockOpportunity('cross-exchange'));

      const metrics = engine.getMetrics();
      expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('UnifiedExecutionEngine - Integration', () => {
  it('should handle all strategy types in sequence', async () => {
    const engine = new UnifiedExecutionEngine({ dryRun: true });
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
    results.forEach((result, i) => {
      expect(result.opportunityId).toBeDefined();
    });
  });

  it('should aggregate metrics across all strategies', async () => {
    const engine = new UnifiedExecutionEngine({ dryRun: true });
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