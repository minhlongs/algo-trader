/**
 * Unit tests for Dual-Level Reflection Engine & Analyzers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reflectOnTrade,
  getReflectionSummary,
  level1Check,
  level2Llm,
  level2Numerical,
  buildL2Prompt,
  L2_SYSTEM,
  type TradeOutcome,
  type ReflectionResult,
} from '../../../src/desk/intelligence/dual-level-reflection-engine';

const mockPublish = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/shared/messaging/index', () => ({
  getMessageBus: () => ({
    publish: mockPublish,
  }),
}));

vi.mock('../../../src/lib/llm-router', () => ({
  LlmRouter: class MockLlmRouter {
    chat = vi.fn().mockRejectedValue(new Error('LLM service unavailable in test'));
  },
}));

describe('Dual-Level Reflection Engine & Analyzers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('level1Check (pure math)', () => {
    it('returns executedCorrectly=true when there are no deviations', () => {
      const trade: TradeOutcome = {
        tradeId: 't1',
        marketId: 'm1',
        strategy: 'poly-arb',
        side: 'BUY',
        entryPrice: 0.45,
        exitPrice: 0.50,
        pnl: 50,
        expectedEdge: 0.05,
        actualEdge: 0.05,
        executionLatency: 100,
        timestamp: Date.now(),
      };

      const result = level1Check(trade);
      expect(result.executedCorrectly).toBe(true);
      expect(result.deviations).toEqual([]);
    });

    it('detects slippage warning when edge deviation exceeds threshold', () => {
      const trade: TradeOutcome = {
        tradeId: 't2',
        marketId: 'm1',
        strategy: 'poly-arb',
        side: 'BUY',
        entryPrice: 0.45,
        exitPrice: 0.46,
        pnl: 10,
        expectedEdge: 0.10,
        actualEdge: 0.02, // edgeDelta = 0.08 / 0.10 = 80% > SLIPPAGE_WARN_PCT (0.50)
        executionLatency: 100,
        timestamp: Date.now(),
      };

      const result = level1Check(trade);
      expect(result.executedCorrectly).toBe(false);
      expect(result.deviations.some(d => d.includes('entry price slippage'))).toBe(true);
    });

    it('detects latency warning when latency exceeds target', () => {
      const trade: TradeOutcome = {
        tradeId: 't3',
        marketId: 'm1',
        strategy: 'poly-arb',
        side: 'BUY',
        entryPrice: 0.45,
        exitPrice: 0.50,
        pnl: 50,
        expectedEdge: 0.05,
        actualEdge: 0.05,
        executionLatency: 800, // exceeds LATENCY_WARN_MS (500)
        timestamp: Date.now(),
      };

      const result = level1Check(trade);
      expect(result.executedCorrectly).toBe(false);
      expect(result.deviations.some(d => d.includes('execution latency 800ms'))).toBe(true);
    });

    it('detects trade still open deviation when exitPrice is null', () => {
      const trade: TradeOutcome = {
        tradeId: 't4',
        marketId: 'm1',
        strategy: 'poly-arb',
        side: 'BUY',
        entryPrice: 0.45,
        exitPrice: null,
        pnl: 0,
        expectedEdge: 0.05,
        actualEdge: 0,
        executionLatency: 50,
        timestamp: Date.now(),
      };

      const result = level1Check(trade);
      expect(result.executedCorrectly).toBe(false);
      expect(result.deviations).toContain('trade still open — P&L unrealized');
    });
  });

  describe('buildL2Prompt & L2_SYSTEM', () => {
    it('formats prompt with complete trade and deviation details', () => {
      expect(L2_SYSTEM).toContain('systematic trading analyst');

      const trade: TradeOutcome = {
        tradeId: 't5',
        marketId: 'm-poly-1',
        strategy: 'endgame-scalp',
        side: 'YES',
        entryPrice: 0.92,
        exitPrice: 0.98,
        pnl: 60,
        expectedEdge: 0.06,
        actualEdge: 0.065,
        executionLatency: 120,
        timestamp: Date.now(),
      };
      const l1 = { executedCorrectly: false, deviations: ['high latency'] };
      const prompt = buildL2Prompt(trade, l1);

      expect(prompt).toContain('Strategy: endgame-scalp');
      expect(prompt).toContain('Market: m-poly-1');
      expect(prompt).toContain('P&L: +60.0000');
      expect(prompt).toContain('Deviations: high latency');
    });

    it('handles open trade (exitPrice=null) in prompt', () => {
      const trade: TradeOutcome = {
        tradeId: 't6',
        marketId: 'm-poly-2',
        strategy: 'logical-arb',
        side: 'NO',
        entryPrice: 0.30,
        exitPrice: null,
        pnl: -5,
        expectedEdge: 0.05,
        actualEdge: -0.01,
        executionLatency: 80,
        timestamp: Date.now(),
      };
      const l1 = { executedCorrectly: true, deviations: [] };
      const prompt = buildL2Prompt(trade, l1);

      expect(prompt).toContain('Exit: OPEN');
      expect(prompt).toContain('P&L: -5.0000');
      expect(prompt).toContain('Deviations: none');
    });
  });

  describe('level2Numerical', () => {
    it('generates purely numerical analysis for profitable and losing trades', () => {
      const winTrade: TradeOutcome = {
        tradeId: 'w1',
        marketId: 'm1',
        strategy: 'strat1',
        side: 'YES',
        entryPrice: 0.5,
        exitPrice: 0.6,
        pnl: 100,
        expectedEdge: 0.1,
        actualEdge: 0.1,
        executionLatency: 50,
        timestamp: Date.now(),
      };
      const winL2 = level2Numerical(winTrade);
      expect(winL2.level2_outcome.profitable).toBe(true);
      expect(winL2.level2_outcome.pnl).toBe(100);
      expect(winL2.level2_outcome.edgeAccuracy).toBe(1);
      expect(winL2.parameterAdjustments).toEqual([]);

      const lossTrade: TradeOutcome = {
        ...winTrade,
        pnl: -50,
        expectedEdge: 0,
        actualEdge: -0.05,
      };
      const lossL2 = level2Numerical(lossTrade);
      expect(lossL2.level2_outcome.profitable).toBe(false);
      expect(lossL2.level2_outcome.edgeAccuracy).toBe(0);
    });
  });

  describe('level2Llm', () => {
    it('parses LLM JSON response with parameter adjustments', async () => {
      const mockChat = vi.fn().mockResolvedValue({
        content: `\`\`\`json
{
  "lesson": "Execution was well-timed but slippage reduced margin.",
  "parameterAdjustments": [
    { "param": "maxSlippageBps", "currentValue": 50, "suggestedValue": 30, "reason": "Tighter control" }
  ]
}
\`\`\``,
      });
      const mockRouter = { chat: mockChat } as any;

      const trade: TradeOutcome = {
        tradeId: 't-llm',
        marketId: 'm-llm',
        strategy: 'strat-llm',
        side: 'YES',
        entryPrice: 0.5,
        exitPrice: 0.6,
        pnl: 10,
        expectedEdge: 0.1,
        actualEdge: 0.08,
        executionLatency: 100,
        timestamp: Date.now(),
      };
      const l1 = { executedCorrectly: true, deviations: [] };

      const res = await level2Llm(trade, l1, mockRouter);
      expect(res.level2_outcome.profitable).toBe(true);
      expect(res.level2_outcome.lesson).toBe('Execution was well-timed but slippage reduced margin.');
      expect(res.parameterAdjustments).toHaveLength(1);
      expect(res.parameterAdjustments[0].param).toBe('maxSlippageBps');
      expect(res.parameterAdjustments[0].suggestedValue).toBe(30);
    });

    it('handles LLM responses with missing lesson or malformed adjustments', async () => {
      const mockChat = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          parameterAdjustments: [
            { param: 'validParam', currentValue: 10, suggestedValue: 20 },
            { param: 123, currentValue: 'bad', suggestedValue: 20 }, // invalid item
          ],
        }),
      });
      const mockRouter = { chat: mockChat } as any;

      const trade: TradeOutcome = {
        tradeId: 't-llm2',
        marketId: 'm-llm2',
        strategy: 'strat-llm2',
        side: 'NO',
        entryPrice: 0.5,
        exitPrice: 0.4,
        pnl: -10,
        expectedEdge: 0,
        actualEdge: 0,
        executionLatency: 100,
        timestamp: Date.now(),
      };

      const res = await level2Llm(trade, { executedCorrectly: true, deviations: [] }, mockRouter);
      expect(res.level2_outcome.lesson).toBe('No lesson extracted.');
      expect(res.parameterAdjustments).toHaveLength(1);
      expect(res.parameterAdjustments[0].param).toBe('validParam');
    });
  });

  describe('reflectOnTrade orchestrator', () => {
    const sampleTrade: TradeOutcome = {
      tradeId: 'trade-orch-1',
      marketId: 'market-1',
      strategy: 'cross-market',
      side: 'BUY',
      entryPrice: 0.5,
      exitPrice: 0.55,
      pnl: 25,
      expectedEdge: 0.05,
      actualEdge: 0.05,
      executionLatency: 120,
      timestamp: Date.now(),
    };

    it('handles disabled reflection (REFLECTION_ENABLED=false)', async () => {
      process.env.REFLECTION_ENABLED = 'false';

      const res = await reflectOnTrade(sampleTrade);
      expect(res.level1_logic.executedCorrectly).toBe(true);
      expect(res.level2_outcome.lesson).toBe('Reflection disabled.');
      expect(res.parameterAdjustments).toEqual([]);
    });

    it('runs numerical fallback when REFLECTION_USE_LLM=false', async () => {
      process.env.REFLECTION_ENABLED = 'true';
      process.env.REFLECTION_USE_LLM = 'false';

      const res = await reflectOnTrade(sampleTrade);
      expect(res.level1_logic.executedCorrectly).toBe(true);
      expect(res.level2_outcome.profitable).toBe(true);
      expect(mockPublish).toHaveBeenCalled();
    });

    it('falls back to numerical Level 2 when LLM call throws', async () => {
      process.env.REFLECTION_ENABLED = 'true';
      process.env.REFLECTION_USE_LLM = 'true';

      // Mock level2Llm failure by forcing error or invalid env
      const badTrade: TradeOutcome = {
        ...sampleTrade,
        tradeId: 'bad-llm-trade',
      };

      const res = await reflectOnTrade(badTrade);
      expect(res.level1_logic).toBeDefined();
      expect(res.level2_outcome).toBeDefined();
    });

    it('handles NATS publish failure gracefully without throwing', async () => {
      process.env.REFLECTION_ENABLED = 'true';
      process.env.REFLECTION_USE_LLM = 'false';
      mockPublish.mockRejectedValueOnce(new Error('NATS offline'));

      await expect(reflectOnTrade(sampleTrade)).resolves.toBeDefined();
    });

    it('aggregates summary metrics across ring buffer reflections', async () => {
      process.env.REFLECTION_ENABLED = 'true';
      process.env.REFLECTION_USE_LLM = 'false';

      // Reset / fill ring
      for (let i = 0; i < 5; i++) {
        await reflectOnTrade({
          ...sampleTrade,
          tradeId: `batch-trade-${i}`,
          pnl: i % 2 === 0 ? 10 : -5,
          executionLatency: i === 0 ? 900 : 100, // 1 deviation
        });
      }

      const summary = getReflectionSummary();
      expect(summary.count).toBeGreaterThanOrEqual(5);
      expect(summary.winRate).toBeGreaterThan(0);
      expect(summary.avgEdgeAccuracy).toBeDefined();
      expect(summary.avgSlippageViolations).toBeDefined();
      expect(Array.isArray(summary.commonDeviations)).toBe(true);
    });
  });
});
