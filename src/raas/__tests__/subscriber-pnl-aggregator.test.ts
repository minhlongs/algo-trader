/**
 * Subscriber P&L Aggregator Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriberPnLAggregator } from '../subscriber-pnl-aggregator';

vi.mock('../../db/postgres-client', () => ({
  query: vi.fn(),
}));

import { query } from '../../db/postgres-client';
const mockQuery = vi.mocked(query);

describe('SubscriberPnLAggregator', () => {
  let aggregator: SubscriberPnLAggregator;

  beforeEach(() => {
    aggregator = new SubscriberPnLAggregator();
    mockQuery.mockReset();
  });

  describe('getSummary', () => {
    it('computes correct metrics from DB row', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          trade_count: '10',
          win_count: '7',
          loss_count: '3',
          total_profit: '500',
          total_loss: '100',
          avg_win: '71.43',
          avg_loss: '33.33',
          best_trade: '200',
          worst_trade: '-80',
          blocked_dlp: '2',
        }],
      } as never);

      const result = await aggregator.getSummary('sub-1');

      expect(result.subscriberId).toBe('sub-1');
      expect(result.totalRealizedPnl).toBeCloseTo(400, 2);
      expect(result.winRate).toBeCloseTo(0.7, 2);
      expect(result.tradeCount).toBe(10);
      expect(result.blockedDlpCount).toBe(2);
      expect(result.profitFactor).toBeCloseTo(5, 1);
    });

    it('handles empty result gracefully (no trades)', async () => {
      mockQuery.mockResolvedValue({
        rows: [{}],
      } as never);

      const result = await aggregator.getSummary('sub-empty');

      expect(result.tradeCount).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.totalRealizedPnl).toBe(0);
      expect(result.profitFactor).toBe(Infinity);
    });

    it('scopes query to the correct subscriber_id', async () => {
      mockQuery.mockResolvedValue({ rows: [{}] } as never);

      await aggregator.getSummary('sub-scoped');

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('sub-scoped');
    });

    it('NEVER returns data for a different subscriber', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          trade_count: '5',
          win_count: '3',
          loss_count: '2',
          total_profit: '200',
          total_loss: '50',
          avg_win: '66',
          avg_loss: '25',
          best_trade: '100',
          worst_trade: '-40',
          blocked_dlp: '0',
        }],
      } as never);

      const resultA = await aggregator.getSummary('sub-A');
      expect(resultA.subscriberId).toBe('sub-A');

      // Verify DB was called with sub-A's id, not some other tenant
      const [, paramsA] = mockQuery.mock.calls[0];
      expect(paramsA).toContain('sub-A');
      expect(paramsA).not.toContain('sub-B');
    });
  });

  describe('getDailyBreakdown', () => {
    it('returns parsed daily rows', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { day: '2026-04-15T00:00:00.000Z', net_pnl: '120', trade_count: '4', win_count: '3' },
          { day: '2026-04-16T00:00:00.000Z', net_pnl: '-30', trade_count: '2', win_count: '0' },
        ],
      } as never);

      const result = await aggregator.getDailyBreakdown('sub-1', 0, Date.now());

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-04-15');
      expect(result[0].netPnl).toBeCloseTo(120, 2);
      expect(result[0].winRate).toBeCloseTo(0.75, 2);
      expect(result[1].netPnl).toBeCloseTo(-30, 2);
      expect(result[1].winRate).toBe(0);
    });

    it('passes fromMs and toMs as params', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as never);

      const from = 1000000;
      const to = 2000000;
      await aggregator.getDailyBreakdown('sub-x', from, to);

      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain(from);
      expect(params).toContain(to);
      expect(params).toContain('sub-x');
    });
  });
});
