/**
 * Tests for LiveTradingStrategyExecutor — strategy tick execution with
 * risk-gate pre-check, per-strategy error tracking, and paper-trade PnL
 * stats. RiskGateManager and the log callback are stubbed; no external
 * dependencies are touched.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveTradingStrategyExecutor } from '../live-trading-strategy-executor';
import type { RiskGateManager } from '../../risk/risk-gate-manager';
import type { TickContext } from '../live-trading-strategy-executor';

function makeRiskManager(): RiskGateManager {
  return { check: vi.fn().mockResolvedValue({ allowed: true }) } as unknown as RiskGateManager;
}

function makeTickData(riskManager: RiskGateManager): TickContext {
  return {
    capitalUsdc: 1000,
    allocatedUsdc: 500,
    positions: new Map(),
    riskManager,
  };
}

describe('LiveTradingStrategyExecutor', () => {
  let riskManager: RiskGateManager;
  let log: ReturnType<typeof vi.fn>;
  let executor: LiveTradingStrategyExecutor;
  let tickData: TickContext;

  beforeEach(() => {
    riskManager = makeRiskManager();
    log = vi.fn();
    executor = new LiveTradingStrategyExecutor(riskManager, log);
    tickData = makeTickData(riskManager);
  });

  describe('executeStrategyTick', () => {
    it('executes the tick and returns success when the risk gate allows', async () => {
      const tickFn = vi.fn().mockResolvedValue(undefined);

      const result = await executor.executeStrategyTick('strat-1', tickFn, tickData);

      expect(result).toEqual({ success: true });
      expect(tickFn).toHaveBeenCalledOnce();
      expect(tickFn).toHaveBeenCalledWith(tickData);
      expect(log).not.toHaveBeenCalled();
    });

    it('skips the tick and logs when the risk gate blocks', async () => {
      (riskManager.check as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: false,
        reason: 'halt mode active',
      });
      const tickFn = vi.fn();

      const result = await executor.executeStrategyTick('strat-1', tickFn, tickData);

      expect(result).toEqual({ success: false, error: 'halt mode active' });
      expect(tickFn).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        'Risk gate blocked strategy strat-1: halt mode active',
        'Orchestrator',
        { strategyKey: 'strat-1', reason: 'halt mode active' },
      );
    });

    it('catches a throwing tick, returns the error, and tracks the error count', async () => {
      const tickFn = vi.fn().mockRejectedValue(new Error('boom'));

      const result = await executor.executeStrategyTick('strat-1', tickFn, tickData);

      expect(result).toEqual({ success: false, error: 'boom' });
      expect(log).toHaveBeenCalledWith(
        'Strategy tick failed for strat-1',
        'Orchestrator',
        { strategyKey: 'strat-1', error: 'boom', consecutiveFailures: 1 },
      );
      const errors = executor.getStrategyErrors().get('strat-1');
      expect(errors).toEqual({ count: 1, lastError: 'boom' });
    });

    it('stringifies non-Error throwables', async () => {
      const tickFn = vi.fn().mockRejectedValue('plain failure');

      const result = await executor.executeStrategyTick('strat-1', tickFn, tickData);

      expect(result).toEqual({ success: false, error: 'plain failure' });
      expect(executor.getStrategyErrors().get('strat-1')).toEqual({
        count: 1,
        lastError: 'plain failure',
      });
    });

    it('accumulates error counts across consecutive failures', async () => {
      const tickFn = vi.fn().mockRejectedValue(new Error('a'));
      await executor.executeStrategyTick('s', tickFn, tickData);
      await executor.executeStrategyTick('s', tickFn, tickData);
      await executor.executeStrategyTick('s', tickFn, tickData);

      expect(executor.getStrategyErrors().get('s')).toEqual({ count: 3, lastError: 'a' });
    });

    it('resets the error count after a successful tick', async () => {
      const failing = vi.fn().mockRejectedValue(new Error('a'));
      await executor.executeStrategyTick('s', failing, tickData);
      await executor.executeStrategyTick('s', failing, tickData);

      const ok = vi.fn().mockResolvedValue(undefined);
      await executor.executeStrategyTick('s', ok, tickData);

      expect(executor.getStrategyErrors().has('s')).toBe(false);
    });
  });

  describe('paper stats', () => {
    it('updatePaperPnl accumulates deltas per strategy', () => {
      executor.updatePaperPnl('s', 10);
      executor.updatePaperPnl('s', -3);
      executor.updatePaperPnl('other', 5);

      const stats = executor.getPaperStats();
      expect(stats.get('s')).toEqual({ paperTrades: 0, paperPnl: 7 });
      expect(stats.get('other')).toEqual({ paperTrades: 0, paperPnl: 5 });
    });

    it('recordPaperTrade increments the trade count', () => {
      executor.recordPaperTrade('s');
      executor.recordPaperTrade('s');
      executor.recordPaperTrade('other');

      const stats = executor.getPaperStats();
      expect(stats.get('s')).toEqual({ paperTrades: 2, paperPnl: 0 });
      expect(stats.get('other')).toEqual({ paperTrades: 1, paperPnl: 0 });
    });

    it('restorePaperStats replaces the stats map wholesale', () => {
      executor.updatePaperPnl('s', 100);
      executor.restorePaperStats([
        ['a', { paperTrades: 1, paperPnl: 2 }],
        ['b', { paperTrades: 3, paperPnl: -4 }],
      ]);

      const stats = executor.getPaperStats();
      expect(stats.size).toBe(2);
      expect(stats.has('s')).toBe(false);
      expect(stats.get('a')).toEqual({ paperTrades: 1, paperPnl: 2 });
      expect(stats.get('b')).toEqual({ paperTrades: 3, paperPnl: -4 });
    });

    it('clearStats wipes both paper stats and error tracking', async () => {
      executor.updatePaperPnl('s', 10);
      executor.recordPaperTrade('s');
      const failing = vi.fn().mockRejectedValue(new Error('x'));
      await executor.executeStrategyTick('s', failing, tickData);
      expect(executor.getPaperStats().size).toBe(1);
      expect(executor.getStrategyErrors().size).toBe(1);

      executor.clearStats();

      expect(executor.getPaperStats().size).toBe(0);
      expect(executor.getStrategyErrors().size).toBe(0);
    });
  });

  describe('getRiskManager', () => {
    it('returns the manager passed to the constructor', () => {
      expect(executor.getRiskManager()).toBe(riskManager);
    });
  });
});
