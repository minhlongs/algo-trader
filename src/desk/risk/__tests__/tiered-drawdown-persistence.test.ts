/**
 * Tests for tiered-drawdown-persistence module.
 *
 * Covers: buildPersistedState shape, loadPersistedState fs mocking,
 * and scheduleDeferredWrite debounce + error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock file-store before importing the module under test
const mockWriteJsonState = vi.fn();
vi.mock('../../persistence/file-store', () => ({
  writeJsonState: (...args: unknown[]) => mockWriteJsonState(...args),
  cashclawPath: (filename: string) => `/fake/data/${filename}`,
}));

// Mock logger to prevent console noise
vi.mock('../../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock node:fs for loadPersistedState
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import * as fs from 'node:fs';
import {
  buildPersistedState,
  scheduleDeferredWrite,
  loadPersistedState,
} from '../tiered-drawdown-persistence';
import type { DrawdownPersistedState, DrawdownEvent } from '../tiered-drawdown-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sampleEvent(overrides: Partial<DrawdownEvent> = {}): DrawdownEvent {
  return {
    tier: 'ALERT',
    drawdownPercent: 0.05,
    portfolioValue: 95000,
    highWaterMark: 100000,
    timestamp: Date.now(),
    action: 'sizing_reduction',
    ...overrides,
  };
}

function sampleState(overrides: Partial<DrawdownPersistedState> = {}): DrawdownPersistedState {
  return {
    highWaterMark: 100000,
    currentValue: 95000,
    tier: 'ALERT',
    haltedUntil: null,
    dailyPausedUntil: null,
    dailyStartValue: 100000,
    dailyPnl: -5000,
    events: [sampleEvent()],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildPersistedState', () => {
  it('should build a DrawdownPersistedState from individual fields', () => {
    const events = [sampleEvent()];
    const result = buildPersistedState(
      100000, 95000, 'ALERT',
      null, null,
      100000, -5000, events,
    );
    expect(result).toEqual({
      highWaterMark: 100000,
      currentValue: 95000,
      tier: 'ALERT',
      haltedUntil: null,
      dailyPausedUntil: null,
      dailyStartValue: 100000,
      dailyPnl: -5000,
      events,
    });
  });

  it('should handle HALT tier with haltUntil timestamp', () => {
    const haltUntil = Date.now() + 3600000;
    const result = buildPersistedState(
      100000, 80000, 'HALT',
      haltUntil, null,
      100000, -20000, [],
    );
    expect(result.tier).toBe('HALT');
    expect(result.haltedUntil).toBe(haltUntil);
  });

  it('should handle DAILY_PAUSE tier with dailyPausedUntil', () => {
    const pausedUntil = Date.now() + 86400000;
    const result = buildPersistedState(
      100000, 96000, 'DAILY_PAUSE',
      null, pausedUntil,
      100000, -4000, [],
    );
    expect(result.tier).toBe('DAILY_PAUSE');
    expect(result.dailyPausedUntil).toBe(pausedUntil);
  });

  it('should preserve empty events array', () => {
    const result = buildPersistedState(
      50000, 50000, 'NORMAL',
      null, null,
      50000, 0, [],
    );
    expect(result.events).toEqual([]);
  });

  it('should preserve multiple events in order', () => {
    const e1 = sampleEvent({ tier: 'ALERT', timestamp: 1000 });
    const e2 = sampleEvent({ tier: 'REDUCE', timestamp: 2000 });
    const result = buildPersistedState(
      100000, 85000, 'REDUCE',
      null, null,
      100000, -15000, [e1, e2],
    );
    expect(result.events).toHaveLength(2);
    expect(result.events[0].tier).toBe('ALERT');
    expect(result.events[1].tier).toBe('REDUCE');
  });
});

describe('loadPersistedState', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('should return parsed state when file exists and is valid JSON', () => {
    const expected = sampleState();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(expected));

    const result = loadPersistedState();
    expect(result).toEqual(expected);
    expect(fs.existsSync).toHaveBeenCalledWith('/fake/data/drawdown-state.json');
    expect(fs.readFileSync).toHaveBeenCalledWith('/fake/data/drawdown-state.json', 'utf-8');
  });

  it('should return null when file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = loadPersistedState();
    expect(result).toBeNull();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should return null when file contains invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('NOT VALID JSON {{{');

    const result = loadPersistedState();
    expect(result).toBeNull();
  });

  it('should return null when readFileSync throws', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = loadPersistedState();
    expect(result).toBeNull();
  });
});

describe('scheduleDeferredWrite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWriteJsonState.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce writes: only the last state is persisted', () => {
    const dw: { data: DrawdownPersistedState; timer: ReturnType<typeof setTimeout> | null } = {
      data: sampleState(),
      timer: null,
    };

    scheduleDeferredWrite(dw, sampleState({ currentValue: 94000 }));
    scheduleDeferredWrite(dw, sampleState({ currentValue: 93000 }));
    scheduleDeferredWrite(dw, sampleState({ currentValue: 92000 }));

    // No writes yet — timer hasn't fired
    expect(mockWriteJsonState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    // Only the last state should be written
    expect(mockWriteJsonState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteJsonState.mock.calls[0][1] as DrawdownPersistedState;
    expect(writtenState.currentValue).toBe(92000);
  });

  it('should clear previous timer when rescheduled', () => {
    const dw: { data: DrawdownPersistedState; timer: ReturnType<typeof setTimeout> | null } = {
      data: sampleState(),
      timer: null,
    };

    scheduleDeferredWrite(dw, sampleState());
    expect(dw.timer).not.toBeNull();

    const firstTimer = dw.timer;
    scheduleDeferredWrite(dw, sampleState());

    // Timer should have been replaced (cleared + new)
    expect(dw.timer).not.toBe(firstTimer);
    expect(dw.timer).not.toBeNull();
  });

  it('should write to the correct file path', () => {
    const dw: { data: DrawdownPersistedState; timer: ReturnType<typeof setTimeout> | null } = {
      data: sampleState(),
      timer: null,
    };

    scheduleDeferredWrite(dw, sampleState());
    vi.advanceTimersByTime(500);

    expect(mockWriteJsonState).toHaveBeenCalledWith(
      '/fake/data/drawdown-state.json',
      expect.any(Object),
    );
  });

  it('should not throw when writeJsonState throws', () => {
    mockWriteJsonState.mockImplementation(() => {
      throw new Error('Disk full');
    });

    const dw: { data: DrawdownPersistedState; timer: ReturnType<typeof setTimeout> | null } = {
      data: sampleState(),
      timer: null,
    };

    scheduleDeferredWrite(dw, sampleState());

    // Should not throw
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });

  it('should set dw.timer to null after write completes', () => {
    const dw: { data: DrawdownPersistedState; timer: ReturnType<typeof setTimeout> | null } = {
      data: sampleState(),
      timer: null,
    };

    scheduleDeferredWrite(dw, sampleState());
    expect(dw.timer).not.toBeNull();

    vi.advanceTimersByTime(500);

    expect(dw.timer).toBeNull();
  });
});
