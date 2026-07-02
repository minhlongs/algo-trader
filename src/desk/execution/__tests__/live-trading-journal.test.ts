/**
 * Tests for Live Trading Journal
 * Phase 41 Live Trading Observability
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { LiveTradingJournal } from '../live-trading-journal';
import { cashclawPath } from '../../../shared/persistence/file-store';

describe('LiveTradingJournal', () => {
  let journal: LiveTradingJournal;

  beforeEach(() => {
    journal = new LiveTradingJournal();
    // Clean test files
    const files = ['live-trades.jsonl', 'live-positions.json', 'live-pnl.json', 'live-journal.jsonl'];
    for (const f of files) {
      try { fs.unlinkSync(cashclawPath(f)); } catch { /* doesn't exist */ }
    }
  });

  afterEach(() => {
    const files = ['live-trades.jsonl', 'live-positions.json', 'live-pnl.json', 'live-journal.jsonl'];
    for (const f of files) {
      try { fs.unlinkSync(cashclawPath(f)); } catch { /* doesn't exist */ }
    }
  });

  it('records and loads fills', () => {
    const fill = {
      tokenId: '0xabc',
      side: 'BUY' as const,
      size: 10,
      price: 0.55,
      filledAt: Date.now(),
      orderId: 'order-1',
    };

    journal.recordFill(fill);
    const fills = journal.loadFills();
    expect(fills).toHaveLength(1);
    expect(fills[0].tokenId).toBe('0xabc');
    expect(fills[0].size).toBe(10);
  });

  it('saves and loads positions', () => {
    journal.savePositions([{ tokenId: '0x01', side: 'BUY', size: 5 }]);
    const positions = journal.loadPositions<{ tokenId: string }>();
    expect(positions).toHaveLength(1);
    expect(positions[0].tokenId).toBe('0x01');
  });

  it('saves and loads daily P&L', () => {
    journal.saveDailyPnl({ date: journal.getToday(), realizedPnl: 42.5, tradeCount: 5, winCount: 3, lossCount: 2 });
    const pnl = journal.loadDailyPnl();
    expect(pnl).not.toBeNull();
    expect(pnl!.realizedPnl).toBe(42.5);
    expect(pnl!.tradeCount).toBe(5);
  });

  it('returns null for daily P&L from a different day', () => {
    journal.saveDailyPnl({ date: '2020-01-01', realizedPnl: 10, tradeCount: 1, winCount: 1, lossCount: 0 });
    const pnl = journal.loadDailyPnl();
    expect(pnl).toBeNull(); // different day → reset
  });

  it('records and loads journal events', () => {
    journal.recordEvent('circuit_trip', { reason: '3 consecutive losses' });
    journal.recordEvent('circuit_reset', { by: 'operator' });

    const events = journal.loadEvents();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('circuit_trip');
    expect(events[1].type).toBe('circuit_reset');
  });

  it('filters events by type', () => {
    journal.recordEvent('fill', { orderId: '1' });
    journal.recordEvent('circuit_trip', { reason: 'test' });
    journal.recordEvent('fill', { orderId: '2' });

    const trips = journal.loadEventsByType('circuit_trip');
    expect(trips).toHaveLength(1);
    expect(trips[0].data.reason).toBe('test');
  });

  it('detects day rollover', () => {
    const today = journal.getToday();
    // Same day → no rollover
    expect(journal.checkDayRollover()).toBeNull();
    // getToday is stable within the same day
    expect(journal.getToday()).toBe(today);
  });

  it('getLifetimeStats returns counts', () => {
    journal.recordFill({ tokenId: '0x01', side: 'BUY', size: 1, price: 0.5, filledAt: Date.now(), orderId: 'o1' });
    journal.recordFill({ tokenId: '0x02', side: 'SELL', size: 2, price: 0.6, filledAt: Date.now(), orderId: 'o2' });

    const stats = journal.getLifetimeStats();
    expect(stats.totalFills).toBe(2);
    expect(stats.totalTrades).toBe(2);
  });

  it('countFillsForDate filters correctly', () => {
    const today = journal.getToday();
    journal.recordFill({ tokenId: '0x01', side: 'BUY', size: 1, price: 0.5, filledAt: new Date('2020-01-01').getTime(), orderId: 'old' });
    journal.recordFill({ tokenId: '0x02', side: 'SELL', size: 2, price: 0.6, filledAt: Date.now(), orderId: 'new' });

    expect(journal.countFillsForDate('2020-01-01')).toBe(1);
    expect(journal.countFillsForDate(today)).toBe(1);
  });
});
