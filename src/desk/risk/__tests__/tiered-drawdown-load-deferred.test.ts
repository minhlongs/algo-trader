import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import * as fs from 'node:fs';
import {
  scheduleDeferredWrite,
  loadPersistedState,
} from '../tiered-drawdown-persistence';
import type { DrawdownPersistedState } from '../tiered-drawdown-types';
import { sampleState } from './tiered-drawdown-persistence.test';

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
    expect(loadPersistedState()).toBeNull();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should return null when file contains invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('NOT VALID JSON {{{');
    expect(loadPersistedState()).toBeNull();
  });

  it('should return null when readFileSync throws', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });
    expect(loadPersistedState()).toBeNull();
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

  const makeDw = (): { data: DrawdownPersistedState; timer: ReturnType<typeof setTimeout> | null } => ({
    data: sampleState(),
    timer: null,
  });

  it('should debounce writes: only the last state is persisted', () => {
    const dw = makeDw();
    scheduleDeferredWrite(dw, sampleState({ currentValue: 94000 }));
    scheduleDeferredWrite(dw, sampleState({ currentValue: 93000 }));
    scheduleDeferredWrite(dw, sampleState({ currentValue: 92000 }));

    expect(mockWriteJsonState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);

    expect(mockWriteJsonState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteJsonState.mock.calls[0][1] as DrawdownPersistedState;
    expect(writtenState.currentValue).toBe(92000);
  });

  it('should clear previous timer when rescheduled', () => {
    const dw = makeDw();
    scheduleDeferredWrite(dw, sampleState());
    expect(dw.timer).not.toBeNull();

    const firstTimer = dw.timer;
    scheduleDeferredWrite(dw, sampleState());

    expect(dw.timer).not.toBe(firstTimer);
    expect(dw.timer).not.toBeNull();
  });

  it('should write to the correct file path', () => {
    const dw = makeDw();
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
    const dw = makeDw();
    scheduleDeferredWrite(dw, sampleState());
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });

  it('should set dw.timer to null after write completes', () => {
    const dw = makeDw();
    scheduleDeferredWrite(dw, sampleState());
    expect(dw.timer).not.toBeNull();

    vi.advanceTimersByTime(500);
    expect(dw.timer).toBeNull();
  });
});
