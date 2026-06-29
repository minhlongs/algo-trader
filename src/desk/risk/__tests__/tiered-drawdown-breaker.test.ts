/**
 * Tiered Drawdown Circuit Breaker Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { TieredDrawdownBreaker, DrawdownEvent } from '../tiered-drawdown-breaker';

/** Use a temp path so tests don't touch ~/.cashclaw */
function tmpStatePath(): string {
  return path.join(os.tmpdir(), `dd-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe('TieredDrawdownBreaker', () => {
  let breaker: TieredDrawdownBreaker;
  let events: DrawdownEvent[];

  beforeEach(() => {
    events = [];
    breaker = new TieredDrawdownBreaker(100000, undefined, (e) => events.push(e), tmpStatePath());
  });

  describe('NORMAL state', () => {
    it('should start in NORMAL tier', () => {
      const state = breaker.getState();
      expect(state.tier).toBe('NORMAL');
      expect(state.highWaterMark).toBe(100000);
      expect(state.sizingMultiplier).toBe(1);
    });

    it('should allow new trades', () => {
      expect(breaker.canOpenNewTrades()).toBe(true);
    });

    it('should update high-water mark on gains', () => {
      breaker.update(105000);
      expect(breaker.getState().highWaterMark).toBe(105000);
    });

    it('should not lower high-water mark on losses', () => {
      breaker.update(105000);
      breaker.update(103000);
      expect(breaker.getState().highWaterMark).toBe(105000);
    });
  });

  describe('ALERT tier (-5%)', () => {
    it('should trigger at 5% drawdown from HWM', () => {
      breaker.update(95000); // -5% of 100K
      const state = breaker.getState();
      expect(state.tier).toBe('ALERT');
      expect(state.sizingMultiplier).toBe(0.75); // reduce by 25%
    });

    it('should still allow trading', () => {
      breaker.update(95000);
      expect(breaker.canOpenNewTrades()).toBe(true);
    });

    it('should emit event', () => {
      breaker.update(95000);
      expect(events.length).toBe(1);
      expect(events[0].tier).toBe('ALERT');
    });

    it('should not re-trigger same tier', () => {
      breaker.update(95000);
      breaker.update(94500);
      expect(events.length).toBe(1); // only 1 event
    });

    it('should return no positions to close', () => {
      breaker.update(95000);
      const toClose = breaker.getPositionsToClose([
        { id: '1', symbol: 'BTC', unrealizedPnl: -100 },
        { id: '2', symbol: 'ETH', unrealizedPnl: 50 },
      ]);
      expect(toClose.length).toBe(0);
    });
  });

  describe('REDUCE tier (-10%)', () => {
    it('should trigger at 10% drawdown', () => {
      breaker.update(90000);
      const state = breaker.getState();
      expect(state.tier).toBe('REDUCE');
      expect(state.sizingMultiplier).toBe(0.5); // halve positions
    });

    it('should close weakest 25% of positions', () => {
      breaker.update(90000);
      const positions = [
        { id: 'worst', symbol: 'A', unrealizedPnl: -500 },
        { id: 'bad', symbol: 'B', unrealizedPnl: -200 },
        { id: 'ok', symbol: 'C', unrealizedPnl: 50 },
        { id: 'good', symbol: 'D', unrealizedPnl: 300 },
      ];
      const toClose = breaker.getPositionsToClose(positions);
      expect(toClose.length).toBe(1); // 25% of 4 = 1
      expect(toClose[0]).toBe('worst');
    });
  });

  describe('HALT tier (-15%)', () => {
    it('should trigger at 15% drawdown', () => {
      breaker.update(85000);
      const state = breaker.getState();
      expect(state.tier).toBe('HALT');
      expect(state.sizingMultiplier).toBe(0);
      expect(state.haltedUntil).not.toBeNull();
    });

    it('should block new trades', () => {
      breaker.update(85000);
      expect(breaker.canOpenNewTrades()).toBe(false);
    });

    it('should close 50% of positions (weakest)', () => {
      breaker.update(85000);
      const positions = [
        { id: 'p1', symbol: 'A', unrealizedPnl: -800 },
        { id: 'p2', symbol: 'B', unrealizedPnl: -300 },
        { id: 'p3', symbol: 'C', unrealizedPnl: 100 },
        { id: 'p4', symbol: 'D', unrealizedPnl: 500 },
      ];
      const toClose = breaker.getPositionsToClose(positions);
      expect(toClose.length).toBe(2);
      expect(toClose).toContain('p1');
      expect(toClose).toContain('p2');
    });

    it('should auto-resume after halt duration', () => {
      breaker.update(85000);
      expect(breaker.canOpenNewTrades()).toBe(false);

      // Simulate time passing beyond 48h halt
      const state = breaker.getState();
      // Override haltedUntil to past
      (breaker as any).haltedUntil = Date.now() - 1000;
      expect(breaker.canOpenNewTrades()).toBe(true);
    });
  });

  describe('HARD_STOP tier (-20%)', () => {
    it('should trigger at 20% drawdown', () => {
      breaker.update(80000);
      const state = breaker.getState();
      expect(state.tier).toBe('HARD_STOP');
      expect(state.sizingMultiplier).toBe(0);
    });

    it('should block all trading', () => {
      breaker.update(80000);
      expect(breaker.canOpenNewTrades()).toBe(false);
    });

    it('should close ALL positions', () => {
      breaker.update(80000);
      const positions = [
        { id: 'p1', symbol: 'A', unrealizedPnl: -1000 },
        { id: 'p2', symbol: 'B', unrealizedPnl: 500 },
        { id: 'p3', symbol: 'C', unrealizedPnl: 200 },
      ];
      const toClose = breaker.getPositionsToClose(positions);
      expect(toClose.length).toBe(3);
    });

    it('should require manual restart', () => {
      breaker.update(80000);
      expect(breaker.canOpenNewTrades()).toBe(false);

      breaker.manualRestart(80000);
      expect(breaker.canOpenNewTrades()).toBe(true);
      expect(breaker.getState().tier).toBe('NORMAL');
      expect(breaker.getState().highWaterMark).toBe(80000); // reset HWM
    });
  });

  describe('DAILY_PAUSE (>3% single-day loss)', () => {
    it('should pause on >3% daily loss', () => {
      // Start at 100K, lose 3.1K in one day
      breaker.update(96900);
      const state = breaker.getState();
      expect(state.tier).toBe('DAILY_PAUSE');
      expect(state.dailyPausedUntil).not.toBeNull();
    });

    it('should block new trades during daily pause', () => {
      breaker.update(96900);
      expect(breaker.canOpenNewTrades()).toBe(false);
    });

    it('should auto-resume after 24h', () => {
      breaker.update(96900);
      (breaker as any).dailyPausedUntil = Date.now() - 1000;
      expect(breaker.canOpenNewTrades()).toBe(true);
    });

    it('should reset daily tracking', () => {
      breaker.update(96900);
      expect(breaker.getState().tier).toBe('DAILY_PAUSE');

      breaker.resetDaily();
      expect(breaker.getState().tier).toBe('NORMAL');
    });
  });

  describe('high-water mark tracking', () => {
    it('should track HWM through gains and losses', () => {
      breaker.update(110000); // new HWM
      expect(breaker.getState().highWaterMark).toBe(110000);

      breaker.update(108000); // loss
      expect(breaker.getState().highWaterMark).toBe(110000); // HWM unchanged

      breaker.update(112000); // new HWM
      expect(breaker.getState().highWaterMark).toBe(112000);
    });

    it('should calculate drawdown from HWM not starting capital', () => {
      breaker.update(120000); // HWM = 120K
      breaker.update(114000); // 5% drawdown from 120K
      expect(breaker.getState().tier).toBe('ALERT');
      expect(breaker.getState().drawdownPercent).toBeCloseTo(0.05, 2);
    });
  });

  describe('event logging', () => {
    it('should emit events for each tier transition', () => {
      breaker.update(95000);  // ALERT
      breaker.update(90000);  // REDUCE
      breaker.update(85000);  // HALT

      expect(events.length).toBe(3);
      expect(events[0].tier).toBe('ALERT');
      expect(events[1].tier).toBe('REDUCE');
      expect(events[2].tier).toBe('HALT');
    });

    it('should include portfolio value and HWM in events', () => {
      breaker.update(95000);
      expect(events[0].portfolioValue).toBe(95000);
      expect(events[0].highWaterMark).toBe(100000);
      expect(events[0].drawdownPercent).toBeCloseTo(0.05, 2);
    });

    it('should keep max 100 events', () => {
      for (let i = 0; i < 120; i++) {
        // Oscillate to trigger events
        breaker.manualRestart(100000);
        breaker.update(80000); // HARD_STOP triggers events
      }
      expect(breaker.getEvents().length).toBeLessThanOrEqual(100);
    });
  });

  describe('sizing multiplier progression', () => {
    it('should reduce sizing progressively through tiers', () => {
      expect(breaker.getSizingMultiplier()).toBe(1);      // NORMAL

      breaker.update(95000);                               // ALERT
      expect(breaker.getSizingMultiplier()).toBe(0.75);

      breaker.update(90000);                               // REDUCE
      expect(breaker.getSizingMultiplier()).toBe(0.5);

      breaker.update(85000);                               // HALT
      expect(breaker.getSizingMultiplier()).toBe(0);

      breaker.manualRestart(100000);
      breaker.update(80000);                               // HARD_STOP
      expect(breaker.getSizingMultiplier()).toBe(0);
    });
  });
});
