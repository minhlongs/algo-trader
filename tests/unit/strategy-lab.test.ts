/** StrategyLabAgent unit tests */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StrategyLabAgent } from '../../src/agentic/strategy-lab';

describe('StrategyLabAgent', () => {
  let agent: StrategyLabAgent;

  beforeEach(() => {
    agent = new StrategyLabAgent();
    vi.clearAllMocks();
  });

  describe('validateStrategy', () => {
    it('returns deterministic mock values', () => {
      const result = agent.validateStrategy('strat-btc');

      expect(result.strategyId).toBe('strat-btc');
      expect(result.sharpe).toBe(1.5);
      expect(result.winRate).toBe(0.55);
      expect(result.maxDrawdown).toBe(0.12);
      expect(result.totalTrades).toBe(250);
    });

    it('passes thresholds (sharpe > 1.0, winRate > 0.5)', () => {
      const result = agent.validateStrategy('strat-eth');

      expect(result.passed).toBe(true);
      expect(result.sharpe > 1.0).toBe(true);
      expect(result.winRate > 0.5).toBe(true);
    });

    it('returns stable results for same strategyId', () => {
      const r1 = agent.validateStrategy('strat-xyz');
      const r2 = agent.validateStrategy('strat-xyz');

      expect(r1).toEqual(r2);
    });
  });

  describe('reRankStrategies', () => {
    it('returns entries sorted by sharpe descending', () => {
      const result = agent.reRankStrategies(['s1', 's2', 's3']);

      expect(result).toHaveLength(3);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].sharpe).toBeGreaterThanOrEqual(result[i].sharpe);
      }
    });

    it('assigns rank 1 to highest sharpe', () => {
      const result = agent.reRankStrategies(['alpha', 'beta', 'gamma']);

      expect(result[0].rank).toBe(1);
      expect(result[result.length - 1].rank).toBe(result.length);
    });

    it('handles single strategy', () => {
      const result = agent.reRankStrategies(['only']);

      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
      expect(result[0].strategyId).toBe('only');
    });

    it('returns empty array for empty input', () => {
      const result = agent.reRankStrategies([]);

      expect(result).toHaveLength(0);
    });

    it('produces deterministic ranks for same input', () => {
      const r1 = agent.reRankStrategies(['a', 'b']);
      const r2 = agent.reRankStrategies(['a', 'b']);

      expect(r1).toEqual(r2);
    });
  });

  describe('publishStrategy', () => {
    it('logs publish event without throwing', () => {
      expect(() => agent.publishStrategy('strat-pub')).not.toThrow();
    });
  });
});
