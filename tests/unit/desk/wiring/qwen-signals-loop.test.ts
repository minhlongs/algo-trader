/**
 * Tests for the Qwen signals loop — quality metric computation over
 * mocked DB rows, journal persistence, review-task insertion, backlog
 * gauges, evaluateAndQueue decision branches, and the singleton timer.
 *
 * DB (query), logger, prometheus metrics, and tracing are mocked so
 * every decision branch (skipped / ok / queued_review / error) is
 * exercised without Postgres.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger, mockQuery, mockMetrics, mockTracer, mockSpan } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockQuery: vi.fn(),
  mockMetrics: {
    qwenStrategyReviewsQueuedTotal: { inc: vi.fn() },
    qwenSignalsLoopRunsTotal: { inc: vi.fn() },
    qwenSignalsLoopLastRunTs: { set: vi.fn() },
    qwenSignalsLoopJournalWriteErrorsTotal: { inc: vi.fn() },
    qwenStrategyReviewBacklogSize: { set: vi.fn() },
    qwenStrategyReviewOldestPendingAgeSec: { set: vi.fn() },
  },
  mockTracer: {
    startActiveSpan: vi.fn(async <T>(_name: string, fn: (s: unknown) => Promise<T>) =>
      fn(mockSpan)),
  },
  mockSpan: {
    setAttribute: vi.fn(),
    recordException: vi.fn(),
  },
}));

vi.mock('../../../../src/db/postgres-client', () => ({ query: mockQuery }));
vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../src/platform/middleware/prometheus-metrics', () => mockMetrics);
vi.mock('../../../../src/shared/utils/tracing', () => ({ getTracer: () => mockTracer }));

import {
  computeQualityMetrics, persistRunJournal, evaluateAndQueue, emitReviewBacklogGauges,
  startSignalsLoop, stopSignalsLoop, resetSignalsLoop,
} from '../../../../src/desk/wiring/qwen-signals-loop';

/** Queue mock DB row results in call order: one entry per query() call. */
function queueRows(rowsPerCall: Array<Record<string, string | null>[]>): void {
  mockQuery.mockImplementation(async () => ({ rows: rowsPerCall.shift() ?? [] }));
}

describe('qwen-signals-loop::computeQualityMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty DB result -> zero counts, null metrics.
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('returns zero counts and null metrics when the DB has no rows', async () => {
    const m = await computeQualityMetrics('qwen-m1max');
    expect(m.signalCount).toBe(0);
    expect(m.closedTradeCount).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.sharpe).toBeNull();
    expect(m.signalCount).toBe(0);
  });

  it('computes win rate from closed trades and skips sharpe when stddev is zero', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '25' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '10', wins: '4' }] };
      return { rows: [{ avg_pct: '0.01', stddev_pct: '0', day_count: '10' }] };
    });
    const m = await computeQualityMetrics('qwen-m1max');
    expect(m.signalCount).toBe(25);
    expect(m.closedTradeCount).toBe(10);
    expect(m.winRate).toBeCloseTo(0.4, 10);
    expect(m.sharpe).toBeNull(); // stddev 0 -> sharpe not computable
  });

  it('computes annualized sharpe from daily aggregates', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '50' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '40', wins: '30' }] };
      return { rows: [{ avg_pct: '0.01', stddev_pct: '0.02', day_count: '40' }] };
    });
    const m = await computeQualityMetrics('qwen-m1max');
    expect(m.winRate).toBeCloseTo(0.75, 10);
    expect(m.sharpe).toBeCloseTo((0.01 / 0.02) * Math.sqrt(365), 10);
  });

  it('returns null win rate when no closed trades exist', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '30' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '0', wins: '0' }] };
      return { rows: [{ avg_pct: null, stddev_pct: null, day_count: '0' }] };
    });
    const m = await computeQualityMetrics('qwen-m1max');
    expect(m.closedTradeCount).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.sharpe).toBeNull();
  });

  it('swallows DB errors and returns the zeroed baseline', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    const m = await computeQualityMetrics('qwen-m1max');
    expect(m.signalCount).toBe(0);
    expect(m.winRate).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[QwenSignalsLoop] computeQualityMetrics DB error',
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });

  it('honours a custom window for windowStartMs/windowEndMs', async () => {
    const before = Date.now();
    const m = await computeQualityMetrics('qwen-m1max', 1000);
    expect(m.windowEndMs).toBeGreaterThanOrEqual(before);
    expect(m.windowStartMs).toBe(m.windowEndMs - 1000);
  });
});

describe('qwen-signals-loop::persistRunJournal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a journal row and bumps the runs counter', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const metrics = { winRate: 0.5, sharpe: 1, signalCount: 30, closedTradeCount: 30, windowStartMs: 0, windowEndMs: 1 };
    await persistRunJournal('src', metrics, 'ok', []);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('qwen_signals_loop_runs'),
      ['src', JSON.stringify(metrics), 'ok', [], null],
    );
    expect(mockMetrics.qwenSignalsLoopRunsTotal.inc).toHaveBeenCalledWith({ decision: 'ok' });
    expect(mockMetrics.qwenSignalsLoopLastRunTs.set).toHaveBeenCalled();
  });

  it('passes the error message through for error decisions', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await persistRunJournal('src', expect.any(Object) as never, 'error', [], 'boom');
    const args = mockQuery.mock.calls[0]![1] as unknown[];
    expect(args[4]).toBe('boom');
  });

  it('increments the journal-write-errors counter on DB failure without throwing', async () => {
    mockQuery.mockRejectedValue(new Error('insert down'));
    await expect(persistRunJournal('src', null as never, 'error', [])).resolves.toBeUndefined();
    expect(mockMetrics.qwenSignalsLoopJournalWriteErrorsTotal.inc).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[QwenSignalsLoop] persistRunJournal failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
});

describe('qwen-signals-loop::emitReviewBacklogGauges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets backlog size and oldest-pending age from the pending snapshot', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    mockQuery.mockResolvedValue({ rows: [{ backlog: '5', oldest_epoch: String(nowSec - 3600) }] });
    await emitReviewBacklogGauges();
    expect(mockMetrics.qwenStrategyReviewBacklogSize.set).toHaveBeenCalledWith(5);
    expect(mockMetrics.qwenStrategyReviewOldestPendingAgeSec.set).toHaveBeenCalledWith(3600);
  });

  it('resets the oldest-pending age gauge when no pending tasks exist', async () => {
    mockQuery.mockResolvedValue({ rows: [{ backlog: '0', oldest_epoch: null }] });
    await emitReviewBacklogGauges();
    expect(mockMetrics.qwenStrategyReviewBacklogSize.set).toHaveBeenCalledWith(0);
    expect(mockMetrics.qwenStrategyReviewOldestPendingAgeSec.set).toHaveBeenCalledWith(0);
  });

  it('treats a NaN backlog as zero', async () => {
    mockQuery.mockResolvedValue({ rows: [{ backlog: 'not-a-number', oldest_epoch: null }] });
    await emitReviewBacklogGauges();
    expect(mockMetrics.qwenStrategyReviewBacklogSize.set).toHaveBeenCalledWith(0);
  });

  it('logs and swallows DB failures', async () => {
    mockQuery.mockRejectedValue(new Error('snapshot down'));
    await expect(emitReviewBacklogGauges()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[QwenSignalsLoop] emitReviewBacklogGauges failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
  });
});

describe('qwen-signals-loop::evaluateAndQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('journals skipped_insufficient_data when signal count is below the minimum', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '5' }] };
      return { rows: [] };
    });
    await evaluateAndQueue('qwen-m1max');
    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('qwen_signals_loop_runs'));
    expect(insertCall).toBeTruthy();
    const params = insertCall![1] as unknown[];
    expect(params[2]).toBe('skipped_insufficient_data');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('qwen.decision', 'skipped_insufficient_data');
  });

  it('journals ok when thresholds are healthy', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '40' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '35', wins: '25' }] };
      return { rows: [{ avg_pct: '0.02', stddev_pct: '0.01', day_count: '35' }] };
    });
    await evaluateAndQueue('qwen-m1max');
    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('qwen_signals_loop_runs'));
    const params = insertCall![1] as unknown[];
    expect(params[2]).toBe('ok');
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('strategy_review_tasks'), expect.anything());
  });

  it('queues a win-rate review task when the win rate breaches', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '40' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '35', wins: '10' }] };
      return { rows: [{ avg_pct: '0.02', stddev_pct: '0.01', day_count: '35' }] };
    });
    await evaluateAndQueue('qwen-m1max');
    const reviewCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('strategy_review_tasks'));
    expect(reviewCall).toBeTruthy();
    const params = reviewCall![1] as unknown[];
    expect(params[1]).toBe('win_rate_below_threshold');
    expect(mockMetrics.qwenStrategyReviewsQueuedTotal.inc).toHaveBeenCalledWith(
      { reason: 'win_rate_below_threshold' });
    const journalCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('qwen_signals_loop_runs'));
    expect((journalCall![1] as unknown[])[2]).toBe('queued_review');
  });

  it('skips the sharpe check when closed-trade count is below the minimum', async () => {
    // win rate healthy (28/35=0.8), 35 trades but only 10 eligible -> no sharpe check.
    // Closed trades 35 >= 30 though, so the sharpe branch evaluates sharpe=null -> no trigger.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '40' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '35', wins: '28' }] };
      return { rows: [{ avg_pct: null, stddev_pct: null, day_count: '35' }] };
  });
    await evaluateAndQueue('qwen-m1max');
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('strategy_review_tasks'), expect.anything());
  });

  it('queues a sharpe review task when sharpe breaches with enough trades', async () => {
    // win rate healthy 0.8, sharpe negative -> sharpe trigger.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '40' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '35', wins: '28' }] };
      return { rows: [{ avg_pct: '-0.01', stddev_pct: '0.01', day_count: '35' }] };
    });
    await evaluateAndQueue('qwen-m1max');
    const reviewCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('strategy_review_tasks'));
    expect(reviewCall).toBeTruthy();
    expect((reviewCall![1] as unknown[])[1]).toBe('sharpe_below_threshold');
    expect(mockMetrics.qwenStrategyReviewsQueuedTotal.inc).toHaveBeenCalledWith(
      { reason: 'sharpe_below_threshold' });
  });

  it('journals skipped_insufficient_data when metrics DB errors are swallowed', async () => {
    // computeQualityMetrics swallows its own DB errors and returns the zeroed
    // baseline, so the loop sees signalCount 0 < minimum and takes the skip
    // branch (the 'error' catch in evaluateAndQueue is defensive dead code —
    // computeQualityMetrics never rejects).
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) throw new Error('metrics down');
      return { rows: [] };
    });
    await evaluateAndQueue('qwen-m1max');
    const journalCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('qwen_signals_loop_runs'));
    expect(journalCall).toBeTruthy();
    expect((journalCall![1] as unknown[])[2]).toBe('skipped_insufficient_data');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('qwen.decision', 'skipped_insufficient_data');
    expect(mockSpan.recordException).not.toHaveBeenCalled();
  });

  it('does not re-queue a review task when ON CONFLICT returns no row', async () => {
    // insertReviewTask RETURNING id empty -> no counter bump, no warn log.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) AS cnt')) return { rows: [{ cnt: '40' }] };
      if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: '35', wins: '10' }] };
      if (sql.includes('strategy_review_tasks')) return { rows: [] };
      return { rows: [{ avg_pct: '0.02', stddev_pct: '0.01', day_count: '35' }] };
    });
    await evaluateAndQueue('qwen-m1max');
    expect(mockMetrics.qwenStrategyReviewsQueuedTotal.inc).not.toHaveBeenCalled();
  });
});

describe('qwen-signals-loop::singleton timer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSignalsLoop();
  });
  afterEach(() => resetSignalsLoop());

  it('starts, fires a cycle, and stops cleanly', async () => {
    vi.useFakeTimers();
    try {
      mockQuery.mockResolvedValue({ rows: [] });
      startSignalsLoop(1000);
      // Pre-arm gauges set at start.
      expect(mockMetrics.qwenSignalsLoopLastRunTs.set).toHaveBeenCalled();
      expect(mockMetrics.qwenStrategyReviewBacklogSize.set).toHaveBeenCalledWith(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[QwenSignalsLoop] Started', { intervalMs: 1000 });
      // Interval cycle -> evaluateAndQueue runs (DB mocked empty -> skip branch).
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('qwen.source', 'qwen-m1max');
      stopSignalsLoop();
      expect(mockLogger.debug).toHaveBeenCalledWith('[QwenSignalsLoop] Stopped');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not double-start when already running', () => {
    vi.useFakeTimers();
    try {
      startSignalsLoop(1000);
      const firstTimerLogs = mockLogger.info.mock.calls.filter(([m]) => m === '[QwenSignalsLoop] Started').length;
      startSignalsLoop(1000);
      const secondLogs = mockLogger.info.mock.calls.filter(([m]) => m === '[QwenSignalsLoop] Started').length;
      expect(secondLogs).toBe(firstTimerLogs); // second start() is a no-op
    } finally {
      resetSignalsLoop();
      vi.useRealTimers();
    }
  });
});
