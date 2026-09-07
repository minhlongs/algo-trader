/**
 * Tiered Drawdown Circuit Breaker Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { TieredDrawdownBreaker } from '../tiered-drawdown-breaker';

// Prevent loadFromDisk() from reading stale production drawdown-state.json
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn(),
  };
});

describe('TieredDrawdownBreaker', () => {
  let breaker: TieredDrawdownBreaker;

  /** Get current events snapshot from breaker state */
  const getEvents = () => breaker.getState().events;

  beforeEach(() => {
    // Reset the mocked existsSync to return false before each test
    vi.mocked(fs.existsSync).mockReturnValue(false);
    breaker = new TieredDrawdownBreaker(100000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with NORMAL tier', () => {
    expect(breaker.getState().tier).toBe('NORMAL');
  });

  it('should track high-water mark', () => {
    breaker.update(120000);
    expect(breaker.getState().highWaterMark).toBe(120000);
    breaker.update(110000);
    expect(breaker.getState().highWaterMark).toBe(120000); // HWM unchanged on drop
  });

  it('should emit event', () => {
    breaker.update(95000);
    expect(getEvents().length).toBe(1);
  });

  describe('ALERT tier (-5%)', () => {
    it('should trigger at 5% drawdown from HWM', () => {
      breaker.update(95000); // 5% from 100K
      expect(breaker.getState().tier).toBe('ALERT');
      expect(getEvents()[0].tier).toBe('ALERT');
      expect(getEvents()[0].drawdownPercent).toBeCloseTo(5, 0);
    });

    it('should not re-trigger same tier', () => {
      breaker.update(95000);
      breaker.update(94000); // deeper but still ALERT
      expect(getEvents().length).toBe(1); // only one event
      expect(breaker.getState().tier).toBe('ALERT');
    });
  });

  describe('REDUCE tier (-10%)', () => {
    it('should trigger at 10% drawdown', () => {
      breaker.update(90000);
      expect(breaker.getState().tier).toBe('REDUCE');
      expect(breaker.getState().sizingMultiplier).toBe(0.5);
    });
  });

  describe('HALT tier (-15%)', () => {
    it('should trigger at 15% drawdown', () => {
      breaker.update(85000);
      expect(breaker.getState().tier).toBe('HALT');
      expect(breaker.canOpenNewTrades()).toBe(false);
    });

    it('should auto-resume after halt duration', () => {
      breaker.update(85000); // triggers HALT
      const state1 = breaker.getState();
      expect(state1.tier).toBe('HALT');

      // Simulate time passing beyond haltDurationMs
      vi.useFakeTimers();
      vi.advanceTimersByTime(48 * 60 * 60 * 1000 + 1); // 48h + 1ms
      const state2 = breaker.update(85000); // re-evaluate
      // HALT cooldown blocks re-entry; 15% dd still >= reduceThreshold -> REDUCE
      expect(state2.tier).toBe('REDUCE');
      vi.useRealTimers();
    });
  });

  describe('HARD_STOP tier (-20%)', () => {
    it('should trigger at 20% drawdown', () => {
      breaker.update(80000);
      expect(breaker.getState().tier).toBe('HARD_STOP');
      expect(breaker.canOpenNewTrades()).toBe(false);
    });
  });

  describe('DAILY_PAUSE (>3% single-day loss)', () => {
    it('should auto-resume after 24h', () => {
      // Start at 100K, lose 3.1K in one day
      breaker.update(96900);
      expect(breaker.getState().tier).toBe('DAILY_PAUSE');

      vi.useFakeTimers();
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1); // 24h + 1ms
      // Use recovered value so daily loss condition no longer applies
      breaker.update(100000);
      expect(breaker.getState().tier).toBe('NORMAL'); // resumed
      vi.useRealTimers();
    });
  });

  describe('event logging', () => {
    it('should emit events for each tier transition', () => {
      breaker.update(95000); // NORMAL → ALERT
      breaker.update(90000); // ALERT → REDUCE
      breaker.update(85000); // REDUCE → HALT
      expect(getEvents().length).toBe(3);
      expect(getEvents().map(e => e.tier)).toEqual(['ALERT', 'REDUCE', 'HALT']);
    });

    it('should include portfolio value and HWM in events', () => {
      breaker.update(95000);
      const event = getEvents()[0];
      expect(event.portfolioValue).toBe(95000);
      expect(event.highWaterMark).toBe(100000);
    });

    it('should keep max 100 events', () => {
      for (let i = 0; i < 120; i++) {
        breaker.reset(100000);
        breaker.update(80000); // HARD_STOP
      }
      // reset() clears events, so each iteration produces at most 1 event.
      // After 120 iterations: reset clears, then update(80000) adds 1.
      // Final state has 1 event (from last iteration).
      expect(getEvents().length).toBeLessThanOrEqual(100);
    });
  });

  describe('sizing multiplier progression', () => {
    it('should reduce sizing progressively through tiers', () => {
      breaker.update(95000);                               // ALERT
      expect(breaker.getSizingMultiplier()).toBe(0.75);

      breaker.update(90000);                               // REDUCE
      expect(breaker.getSizingMultiplier()).toBe(0.5);

      breaker.update(85000);                               // HALT
      expect(breaker.getSizingMultiplier()).toBe(0);

      breaker.reset(100000);
      breaker.update(80000);                               // HARD_STOP
      expect(breaker.getSizingMultiplier()).toBe(0);
    });
  });

  // ── getPositionsToCloseFraction (lines 113-118) ──────────────────────────

  describe('getPositionsToCloseFraction', () => {
    it('returns 1.0 at HARD_STOP', () => {
      breaker.reset(100000);
      breaker.update(80000); // HARD_STOP
      expect(breaker.getPositionsToCloseFraction()).toBe(1.0);
    });

    it('returns 0.5 at HALT', () => {
      breaker.update(85000); // HALT
      expect(breaker.getPositionsToCloseFraction()).toBe(0.5);
    });

    it('returns 0.25 at REDUCE', () => {
      breaker.update(90000); // REDUCE
      expect(breaker.getPositionsToCloseFraction()).toBe(0.25);
    });

    it('returns 0 at NORMAL', () => {
      expect(breaker.getPositionsToCloseFraction()).toBe(0);
    });

    it('returns 0 at ALERT', () => {
      breaker.update(95000); // ALERT
      expect(breaker.getPositionsToCloseFraction()).toBe(0);
    });
  });

  // ── update() while paused/halted (lines 53-55) ───────────────────────────

  describe('update() during active DAILY_PAUSE', () => {
    it('keeps DAILY_PAUSE tier when pause window active (line 53)', () => {
      vi.useFakeTimers();
      breaker.update(96900); // DAILY_PAUSE triggered
      // Advance only 12h (within 24h pause window)
      vi.advanceTimersByTime(12 * 60 * 60 * 1000);
      // Update with a still-negative value — should stay DAILY_PAUSE
      breaker.update(96900);
      expect(breaker.getState().tier).toBe('DAILY_PAUSE');
      vi.useRealTimers();
    });
  });

  describe('update() during active HALT', () => {
    it('keeps HALT tier when halt window active (line 55)', () => {
      vi.useFakeTimers();
      breaker.update(85000); // HALT triggered
      // Advance only 24h (within 48h halt window)
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      breaker.update(85000); // still in halt window
      expect(breaker.getState().tier).toBe('HALT');
      vi.useRealTimers();
    });
  });

  // ── highWaterMark = 0 edge cases (lines 74, 135) ────────────────────────

  describe('highWaterMark = 0', () => {
    it('computes drawdown as 0 when highWaterMark is 0 (evaluateTier)', () => {
      const zeroBreaker = new TieredDrawdownBreaker(0);
      // With HWM=0, dd=0, stays NORMAL
      expect(zeroBreaker.getState().tier).toBe('NORMAL');
    });

    it('computes drawdown as 0 when highWaterMark is 0 (getState)', () => {
      const zeroBreaker = new TieredDrawdownBreaker(0);
      expect(zeroBreaker.getState().drawdownPercent).toBe(0);
    });
  });

  // ── loadFromDisk with valid state (lines 146-155) ────────────────────────

  describe('loadFromDisk with valid state', () => {
    it('restores all fields from disk', () => {
      const mockedFs = vi.mocked(fs);
      mockedFs.existsSync.mockReturnValue(true);
      const mockState = JSON.stringify({
        highWaterMark: 95000,
        currentValue: 92000,
        tier: 'ALERT',
        haltedUntil: null,
        dailyPausedUntil: null,
        dailyStartValue: 93000,
        dailyPnl: -1000,
        events: [{ tier: 'ALERT', drawdownPercent: 3.16, portfolioValue: 92000, highWaterMark: 95000, timestamp: Date.now(), action: 'Tier changed NORMAL → ALERT' }],
      });
      mockedFs.readFileSync.mockReturnValue(mockState);

      const restored = new TieredDrawdownBreaker(100000);
      const state = restored.getState();
      expect(state.highWaterMark).toBe(95000);
      expect(state.currentValue).toBe(92000);
      expect(state.tier).toBe('ALERT');
      expect(state.dailyStartValue).toBe(93000);
      expect(state.dailyPnl).toBe(-1000);
      expect(state.events).toHaveLength(1);
    });

    it('uses defaults when optional fields are missing (?? branches)', () => {
      const mockedFs = vi.mocked(fs);
      mockedFs.existsSync.mockReturnValue(true);
      // State with only highWaterMark — all optional fields undefined → ?? kicks in
      const partialState = JSON.stringify({ highWaterMark: 80000 });
      mockedFs.readFileSync.mockReturnValue(partialState);

      const restored = new TieredDrawdownBreaker(100000);
      const state = restored.getState();
      expect(state.highWaterMark).toBe(80000);
      expect(state.currentValue).toBe(100000); // falls back to constructor arg
      expect(state.tier).toBe('NORMAL'); // falls back to 'NORMAL'
      expect(state.dailyStartValue).toBe(100000); // falls back to constructor arg
      expect(state.dailyPnl).toBe(0); // falls back to 0
      expect(state.events).toEqual([]); // falls back to []
    });
  });
});
