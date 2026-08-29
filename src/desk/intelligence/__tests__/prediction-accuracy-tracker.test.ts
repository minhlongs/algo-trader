/**
 * Tests for prediction-accuracy-tracker — record/check/report lifecycle.
 * The tracker loads via persistent-store readJson but saves with raw fs
 * (write tmp + rename). We mock readJson with an in-memory array and
 * stub the fs write path so nothing touches the real data/ directory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory stand-in for data/predictions.json
const store: unknown[] = [];
const getStore = () => store;

const { mockLogger, mockUpsertPg, mockUpdateResolutionPg, mockReadJson } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockUpsertPg: vi.fn(async () => {}),
  mockUpdateResolutionPg: vi.fn(async () => {}),
  mockReadJson: vi.fn((_p: string) => (getStore().length ? JSON.parse(JSON.stringify(getStore())) : null)),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../prediction-pg-store', () => ({
  upsertPredictionPg: mockUpsertPg,
  updatePredictionResolutionPg: mockUpdateResolutionPg,
}));
vi.mock('../../../shared/persistence/persistent-store', () => ({
  readJson: mockReadJson,
}));
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((_tmp: string, data: unknown) => {
      getStore().length = 0;
      getStore().push(...(JSON.parse(String(data)) as unknown[]));
    }),
    renameSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((_tmp: string, data: unknown) => {
    getStore().length = 0;
    getStore().push(...(JSON.parse(String(data)) as unknown[]));
  }),
  renameSync: vi.fn(),
}));

import {
  recordPrediction, checkResolutions, getAccuracyReport,
  getAllStrategyAccuracy, printAccuracyReport, startResolutionChecker,
} from '../prediction-accuracy-tracker';
import type { Prediction } from '../prediction-accuracy-tracker';
import * as fs from 'fs';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  getStore().length = 0;
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockUpsertPg.mockClear();
  mockUpdateResolutionPg.mockClear();
  mockReadJson.mockClear();
  mockUpsertPg.mockResolvedValue(undefined);
  mockUpdateResolutionPg.mockResolvedValue(undefined);
  // vi.clearAllMocks() does not clear vi.fn()s created inside vi.mock()
  // factories, so reset the fs stubs' call history explicitly each cycle.
  fs.writeFileSync.mock.calls.length = 0;
  fs.writeFileSync.mock.results.length = 0;
  fs.renameSync.mock.calls.length = 0;
  fs.renameSync.mock.results.length = 0;
  fs.mkdirSync.mock.calls.length = 0;
  fs.mkdirSync.mock.results.length = 0;
  fs.existsSync.mock.calls.length = 0;
  fs.existsSync.mock.results.length = 0;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    id: 'p-1',
    marketId: 'm-1',
    title: 'Will it rain?',
    predictedOutcome: 'YES',
    confidence: 0.75,
    predictedAt: 1_700_000_000_000,
    marketYesPrice: 0.6,
    strategy: 'momentum',
    actualOutcome: null,
    resolvedAt: null,
    correct: null,
    ...overrides,
  };
}

describe('recordPrediction', () => {
  it('appends a new prediction and dual-writes to PG', () => {
    recordPrediction(makePrediction());
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(getStore()).toHaveLength(1);
    expect((getStore()[0] as Prediction).id).toBe('p-1');
    expect(mockUpsertPg).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }));
    expect(mockLogger.info).toHaveBeenCalledWith('[AccuracyTracker] Prediction recorded', expect.anything());
  });

  it('replaces an existing prediction by id (upsert semantics)', () => {
    recordPrediction(makePrediction({ confidence: 0.6 }));
    recordPrediction(makePrediction({ confidence: 0.9, strategy: 'arb' }));
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    expect(getStore()).toHaveLength(1);
    expect((getStore()[0] as Prediction).confidence).toBe(0.9);
    expect((getStore()[0] as Prediction).strategy).toBe('arb');
  });

  it('logs but does not throw when the PG dual-write rejects', async () => {
    mockUpsertPg.mockRejectedValueOnce(new Error('pg down'));
    recordPrediction(makePrediction());
    await new Promise(r => setImmediate(r));
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[AccuracyTracker] PG dual-write failed',
      expect.objectContaining({ id: 'p-1' }),
    );
  });
});

describe('checkResolutions', () => {
  it('returns 0 with no pending predictions', async () => {
    recordPrediction(makePrediction({ actualOutcome: 'YES', correct: true, resolvedAt: 1 }));
    const n = await checkResolutions();
    expect(n).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith('[AccuracyTracker] No pending predictions to check');
  });

  it('resolves pending predictions against the Gamma API', async () => {
    recordPrediction(makePrediction({ id: 'p-a', marketId: 'm-a', predictedOutcome: 'YES' }));
    recordPrediction(makePrediction({ id: 'p-b', marketId: 'm-b', predictedOutcome: 'YES' }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'm-a', resolvedOutcome: 'YES' },
        { id: 'm-b', resolvedOutcome: 'NO' },
      ],
    });
    const n = await checkResolutions();
    expect(n).toBe(2);
    const a = getStore().find(p => (p as Prediction).id === 'p-a') as Prediction;
    const b = getStore().find(p => (p as Prediction).id === 'p-b') as Prediction;
    expect(a.actualOutcome).toBe('YES');
    expect(a.correct).toBe(true);
    expect(b.actualOutcome).toBe('NO');
    expect(b.correct).toBe(false);
    expect(mockUpdateResolutionPg).toHaveBeenCalledTimes(2);
  });

  it('ignores markets whose resolvedOutcome is neither YES nor NO', async () => {
    recordPrediction(makePrediction({ marketId: 'm-x' }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'm-x', resolvedOutcome: 'MAYBE' }],
    });
    const n = await checkResolutions();
    expect(n).toBe(0);
    expect((getStore()[0] as Prediction).actualOutcome).toBeNull();
  });

  it('returns 0 on a non-ok Gamma response', async () => {
    recordPrediction(makePrediction());
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const n = await checkResolutions();
    expect(n).toBe(0);
    expect(mockLogger.warn).toHaveBeenCalledWith('[AccuracyTracker] Gamma API error', { status: 500 });
  });

  it('logs and swallows fetch failures', async () => {
    recordPrediction(makePrediction());
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const n = await checkResolutions();
    expect(n).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith('[AccuracyTracker] Resolution check failed', expect.anything());
  });
});

describe('getAccuracyReport', () => {
  beforeEach(() => {
    recordPrediction(makePrediction({ id: 'r1', strategy: 'momentum', confidence: 0.72, actualOutcome: 'YES', correct: true, resolvedAt: 1 }));
    recordPrediction(makePrediction({ id: 'r2', strategy: 'arb', confidence: 0.55, actualOutcome: 'NO', correct: false, resolvedAt: 1 }));
    recordPrediction(makePrediction({ id: 'r3', strategy: 'momentum', confidence: 0.8, actualOutcome: null, correct: null, resolvedAt: null }));
  });

  it('computes totals, win rate and averages', () => {
    const r = getAccuracyReport();
    expect(r.totalPredictions).toBe(3);
    expect(r.resolved).toBe(2);
    expect(r.pending).toBe(1);
    expect(r.correct).toBe(1);
    expect(r.incorrect).toBe(1);
    expect(r.winRate).toBeCloseTo(0.5, 10);
    expect(r.avgConfidenceWhenCorrect).toBeCloseTo(0.72, 10);
    expect(r.avgConfidenceWhenIncorrect).toBeCloseTo(0.55, 10);
  });

  it('groups accuracy by strategy', () => {
    const r = getAccuracyReport();
    expect(r.byStrategy['momentum']).toEqual({ total: 1, correct: 1, winRate: 1 });
    expect(r.byStrategy['arb']).toEqual({ total: 1, correct: 0, winRate: 0 });
  });

  it('buckets confidence to nearest 10% range', () => {
    const r = getAccuracyReport();
    expect(r.byConfidenceBucket['0.7-0.8']).toEqual({ total: 1, correct: 1, winRate: 1 });
    expect(r.byConfidenceBucket['0.5-0.6']).toEqual({ total: 1, correct: 0, winRate: 0 });
    expect(r.byConfidenceBucket['0.8-0.9']).toBeUndefined();
  });
});

describe('getAllStrategyAccuracy', () => {
  it('only lists strategies with at least one resolved prediction', () => {
    recordPrediction(makePrediction({ id: 'r1', strategy: 'momentum', actualOutcome: 'YES', correct: true, resolvedAt: 1 }));
    recordPrediction(makePrediction({ id: 'r2', strategy: 'ghost', actualOutcome: null, correct: null, resolvedAt: null }));
    const list = getAllStrategyAccuracy();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ strategyName: 'momentum', winRate: 1, totalTrades: 1 });
    expect(typeof list[0].lastUpdated).toBe('string');
  });
});

describe('printAccuracyReport', () => {
  it('logs the full formatted report without throwing', () => {
    recordPrediction(makePrediction({ id: 'r1', strategy: 'momentum', confidence: 0.91, actualOutcome: 'YES', correct: true, resolvedAt: 1 }));
    expect(() => printAccuracyReport()).not.toThrow();
    expect(mockLogger.info).toHaveBeenCalledWith('=== PREDICTION ACCURACY REPORT ===');
  });
});

describe('startResolutionChecker', () => {
  it('runs an immediate check and returns an interval handle', async () => {
    recordPrediction(makePrediction({ actualOutcome: 'YES', correct: true, resolvedAt: 1 }));
    const handle = startResolutionChecker(60_000);
    expect(handle).toHaveProperty('unref');
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[AccuracyTracker] Starting resolution checker',
      { intervalMs: 60_000 },
    );
    clearInterval(handle);
  });

  it('logs when the immediate check rejects', async () => {
    recordPrediction(makePrediction());
    fetchMock.mockRejectedValueOnce(new Error('first check boom'));
    const handle = startResolutionChecker(60_000);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[AccuracyTracker] Resolution check failed',
      expect.anything(),
    );
    clearInterval(handle);
  });
});
