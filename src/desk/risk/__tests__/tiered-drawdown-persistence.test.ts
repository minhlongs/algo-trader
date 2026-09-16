import { describe, it, expect, vi } from 'vitest';

const mockWriteJsonState = vi.fn();
vi.mock('../../persistence/file-store', () => ({
  writeJsonState: (...args: unknown[]) => mockWriteJsonState(...args),
  cashclawPath: (filename: string) => `/fake/data/${filename}`,
}));
vi.mock('../../utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});

import { buildPersistedState } from '../tiered-drawdown-persistence';
import type { DrawdownPersistedState, DrawdownEvent } from '../tiered-drawdown-types';

export function sampleEvent(overrides: Partial<DrawdownEvent> = {}): DrawdownEvent {
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

export function sampleState(overrides: Partial<DrawdownPersistedState> = {}): DrawdownPersistedState {
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

describe('buildPersistedState', () => {
  it('should build a DrawdownPersistedState from individual fields', () => {
    const events = [sampleEvent()];
    const result = buildPersistedState(100000, 95000, 'ALERT', null, null, 100000, -5000, events);
    expect(result).toEqual({
      highWaterMark: 100000, currentValue: 95000, tier: 'ALERT',
      haltedUntil: null, dailyPausedUntil: null, dailyStartValue: 100000, dailyPnl: -5000, events,
    });
  });

  it('should handle HALT tier with haltUntil timestamp', () => {
    const haltUntil = Date.now() + 3600000;
    const result = buildPersistedState(100000, 80000, 'HALT', haltUntil, null, 100000, -20000, []);
    expect(result.tier).toBe('HALT');
    expect(result.haltedUntil).toBe(haltUntil);
  });

  it('should handle DAILY_PAUSE tier with dailyPausedUntil', () => {
    const pausedUntil = Date.now() + 86400000;
    const result = buildPersistedState(100000, 96000, 'DAILY_PAUSE', null, pausedUntil, 100000, -4000, []);
    expect(result.tier).toBe('DAILY_PAUSE');
    expect(result.dailyPausedUntil).toBe(pausedUntil);
  });

  it('should preserve empty events array', () => {
    const result = buildPersistedState(50000, 50000, 'NORMAL', null, null, 50000, 0, []);
    expect(result.events).toEqual([]);
  });

  it('should preserve multiple events in order', () => {
    const e1 = sampleEvent({ tier: 'ALERT', timestamp: 1000 });
    const e2 = sampleEvent({ tier: 'REDUCE', timestamp: 2000 });
    const result = buildPersistedState(100000, 85000, 'REDUCE', null, null, 100000, -15000, [e1, e2]);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].tier).toBe('ALERT');
    expect(result.events[1].tier).toBe('REDUCE');
  });
});
