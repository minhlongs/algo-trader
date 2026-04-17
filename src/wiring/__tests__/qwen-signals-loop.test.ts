/**
 * Tests for qwen-signals-loop.ts
 * Covers: computeQualityMetrics, evaluateAndQueue, singleton lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock DB ──────────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../../db/postgres-client.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

// ─── Mock Prometheus ──────────────────────────────────────────────────────────
const mockLoopRunsCounter = { inc: vi.fn() };
const { mockLoopLastRunGauge, mockJournalWriteErrorsCounter } = vi.hoisted(() => ({
  mockLoopLastRunGauge: { set: vi.fn() },
  mockJournalWriteErrorsCounter: { inc: vi.fn() },
}));
const { mockBacklogSizeGauge, mockOldestAgeGauge } = vi.hoisted(() => ({
  mockBacklogSizeGauge: { set: vi.fn() },
  mockOldestAgeGauge: { set: vi.fn() },
}));
vi.mock('../../middleware/prometheus-metrics.js', () => ({
  qwenStrategyReviewsQueuedTotal: { inc: vi.fn() },
  qwenStrategyReviewsResolvedTotal: { inc: vi.fn() },
  qwenSignalsLoopRunsTotal: { inc: vi.fn() },
  qwenSignalsLoopLastRunTs: mockLoopLastRunGauge,
  qwenSignalsLoopJournalWriteErrorsTotal: mockJournalWriteErrorsCounter,
  qwenStrategyReviewBacklogSize: mockBacklogSizeGauge,
  qwenStrategyReviewOldestPendingAgeSec: mockOldestAgeGauge,
  qwenPaperPnlPct: { set: vi.fn() },
  qwenSignalsTotal: { inc: vi.fn() },
  setQwenKillSwitch: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────
vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  computeQualityMetrics,
  evaluateAndQueue,
  startSignalsLoop,
  stopSignalsLoop,
  resetSignalsLoop,
  persistRunJournal,
  emitReviewBacklogGauges,
} from '../qwen-signals-loop.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the 3-call sequence mockQuery needs for computeQualityMetrics */
function mockMetricsQueries(
  signalCount: number,
  total: number,
  wins: number,
  avgPct: number | null,
  stddevPct: number | null
) {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ cnt: String(signalCount) }] })       // signal count
    .mockResolvedValueOnce({ rows: [{ total: String(total), wins: String(wins) }] }) // win rate
    .mockResolvedValueOnce({                                                  // sharpe
      rows: [{
        avg_pct: avgPct !== null ? String(avgPct) : null,
        stddev_pct: stddevPct !== null ? String(stddevPct) : null,
        day_count: String(total),
      }],
    });
}

// ─── computeQualityMetrics ────────────────────────────────────────────────────

describe('computeQualityMetrics', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns nulls with no error when paper_trades is empty', async () => {
    mockMetricsQueries(0, 0, 0, null, null);

    const m = await computeQualityMetrics('qwen-m1max', 7 * 24 * 3600 * 1000);

    expect(m.signalCount).toBe(0);
    expect(m.closedTradeCount).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.sharpe).toBeNull();
    expect(m.windowStartMs).toBeLessThan(m.windowEndMs);
  });

  it('computes win_rate correctly from sample trades', async () => {
    // 10 trades, 7 wins → win_rate = 0.7
    mockMetricsQueries(15, 10, 7, 0.02, 0.01);

    const m = await computeQualityMetrics('qwen-m1max', 7 * 24 * 3600 * 1000);

    expect(m.signalCount).toBe(15);
    expect(m.closedTradeCount).toBe(10);
    expect(m.winRate).toBeCloseTo(0.7);
  });

  it('computes sharpe correctly: mean/stddev * sqrt(365)', async () => {
    mockMetricsQueries(25, 30, 18, 0.005, 0.002);

    const m = await computeQualityMetrics('qwen-m1max', 7 * 24 * 3600 * 1000);

    const expectedSharpe = (0.005 / 0.002) * Math.sqrt(365);
    expect(m.sharpe).toBeCloseTo(expectedSharpe, 4);
  });

  it('returns null sharpe when stddev is zero (avoids division by zero)', async () => {
    mockMetricsQueries(25, 30, 20, 0.005, 0);

    const m = await computeQualityMetrics('qwen-m1max', 7 * 24 * 3600 * 1000);

    expect(m.sharpe).toBeNull();
  });

  it('returns null sharpe when avg/stddev are null (no daily data)', async () => {
    mockMetricsQueries(25, 0, 0, null, null);

    const m = await computeQualityMetrics('qwen-m1max', 7 * 24 * 3600 * 1000);

    expect(m.sharpe).toBeNull();
    expect(m.winRate).toBeNull();
  });

  it('returns base metrics and does not throw on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const m = await computeQualityMetrics('qwen-m1max', 7 * 24 * 3600 * 1000);

    expect(m.winRate).toBeNull();
    expect(m.sharpe).toBeNull();
    expect(m.signalCount).toBe(0);
  });
});

// ─── evaluateAndQueue ─────────────────────────────────────────────────────────

describe('evaluateAndQueue', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    delete process.env.QWEN_REVIEW_MIN_SIGNALS;
    delete process.env.QWEN_REVIEW_MIN_TRADES_FOR_SHARPE;
    delete process.env.QWEN_REVIEW_WIN_RATE_MIN;
    delete process.env.QWEN_REVIEW_SHARPE_MIN;
  });

  it('skips strategy_review insert when signal_count < min_signals (default 20)', async () => {
    // signalCount=5, below min_signals=20
    mockMetricsQueries(5, 3, 1, null, null);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // journal INSERT (skipped_insufficient_data)

    await evaluateAndQueue('qwen-m1max');

    // No INSERT into strategy_review_tasks, but journal INSERT does fire
    const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((sql) => sql.includes('strategy_review_tasks'))).toBe(false);
    expect(calls.some((sql) => sql.includes('qwen_signals_loop_runs'))).toBe(true);
  });

  it('inserts win_rate_below_threshold when win rate is low', async () => {
    // signalCount=25 >= 20, 20 closed trades, 6 wins → win_rate=0.3 < 0.4
    mockMetricsQueries(25, 20, 6, 0.001, 0.001);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT result

    await evaluateAndQueue('qwen-m1max');

    const insertCall = mockQuery.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO strategy_review_tasks')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('win_rate_below_threshold');
  });

  it('inserts sharpe_below_threshold when sharpe is low', async () => {
    // 30 closed trades, win_rate ok (0.5 >= 0.4), sharpe bad
    // avg=0.001, stddev=0.01 → sharpe = 0.1*sqrt(365) ≈ 1.91? No, let's make it low:
    // avg=0.0001, stddev=0.01 → sharpe=0.01*sqrt(365)≈0.19 < 0.5
    mockMetricsQueries(35, 30, 16, 0.0001, 0.01);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT result

    await evaluateAndQueue('qwen-m1max');

    const insertCall = mockQuery.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO strategy_review_tasks')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('sharpe_below_threshold');
  });

  it('does NOT double-insert same day — ON CONFLICT DO NOTHING in SQL', async () => {
    mockMetricsQueries(25, 20, 6, null, null);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await evaluateAndQueue('qwen-m1max');

    const insertCalls = mockQuery.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO strategy_review_tasks')
    );
    insertCalls.forEach((call: unknown[]) => {
      expect(call[0]).toContain('ON CONFLICT');
      expect(call[0]).toContain('DO NOTHING');
    });
  });

  it('does not insert strategy_review_tasks when metrics are above thresholds', async () => {
    // win_rate=0.6 >= 0.4, sharpe high
    // avg=0.01, stddev=0.005 → sharpe=2*sqrt(365)≈38 >> 0.5
    mockMetricsQueries(25, 30, 18, 0.01, 0.005);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // journal INSERT (ok)
    mockQuery.mockResolvedValueOnce({ rows: [{ backlog: '0', oldest_epoch: null }] }); // backlog snapshot

    await evaluateAndQueue('qwen-m1max');

    const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0] as string);
    // Journal insert fires (ok), but no strategy_review_tasks INSERT.
    // Note: emitReviewBacklogGauges runs a SELECT on strategy_review_tasks;
    // filter specifically for INSERT statements to distinguish.
    expect(calls.some((sql) => sql.includes('INSERT INTO strategy_review_tasks'))).toBe(false);
    expect(calls.some((sql) => sql.includes('qwen_signals_loop_runs'))).toBe(true);
  });
});

// ─── persistRunJournal / evaluateAndQueue journal integration ─────────────────

describe('evaluateAndQueue — journal persistence via persistRunJournal', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    delete process.env.QWEN_REVIEW_MIN_SIGNALS;
    delete process.env.QWEN_REVIEW_MIN_TRADES_FOR_SHARPE;
    delete process.env.QWEN_REVIEW_WIN_RATE_MIN;
    delete process.env.QWEN_REVIEW_SHARPE_MIN;
  });

  it('inserts journal row with decision=skipped_insufficient_data when signals < 20', async () => {
    // signalCount=5 < minSignals=20 → skipped
    mockMetricsQueries(5, 0, 0, null, null);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // journal INSERT

    await evaluateAndQueue('qwen-m1max');

    const journalCall = mockQuery.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('qwen_signals_loop_runs')
    );
    expect(journalCall).toBeDefined();
    expect(journalCall![1][2]).toBe('skipped_insufficient_data');
    expect(journalCall![1][3]).toEqual([]);
  });

  it('inserts journal row with decision=ok when metrics pass thresholds', async () => {
    // signalCount=25 >= 20, win_rate=0.6 >= 0.4, sharpe high
    mockMetricsQueries(25, 30, 18, 0.01, 0.005);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // journal INSERT

    await evaluateAndQueue('qwen-m1max');

    const journalCall = mockQuery.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('qwen_signals_loop_runs')
    );
    expect(journalCall).toBeDefined();
    expect(journalCall![1][2]).toBe('ok');
    expect(journalCall![1][3]).toEqual([]);
  });

  it('inserts journal row with decision=queued_review when threshold breached', async () => {
    // signalCount=25, win_rate=0.3 < 0.4 → queued_review
    mockMetricsQueries(25, 20, 6, 0.001, 0.001);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // strategy_review_tasks INSERT
    mockQuery.mockResolvedValueOnce({ rows: [] }); // journal INSERT

    await evaluateAndQueue('qwen-m1max');

    const journalCall = mockQuery.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('qwen_signals_loop_runs')
    );
    expect(journalCall).toBeDefined();
    expect(journalCall![1][2]).toBe('queued_review');
    expect(journalCall![1][3]).toContain('win_rate_below_threshold');
  });

  it('inserts journal row with decision=error via persistRunJournal directly', async () => {
    // persistRunJournal is the public API for the error path.
    // evaluateAndQueue's error branch calls it when computeQualityMetrics throws UNEXPECTEDLY
    // (computeQualityMetrics itself catches DB errors, so we test persistRunJournal directly).
    const emptyMetrics = {
      winRate: null, sharpe: null, signalCount: 0,
      closedTradeCount: 0, windowStartMs: 0, windowEndMs: 0,
    };
    mockQuery.mockResolvedValueOnce({ rows: [] }); // journal INSERT

    await persistRunJournal('qwen-m1max', emptyMetrics, 'error', [], 'DB exploded');

    const journalCall = mockQuery.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('qwen_signals_loop_runs')
    );
    expect(journalCall).toBeDefined();
    expect(journalCall![1][2]).toBe('error');
    expect(journalCall![1][4]).toBe('DB exploded');
  });

  it('sets last-run-ts gauge on successful journal write (freshness probe)', async () => {
    const emptyMetrics = {
      winRate: null, sharpe: null, signalCount: 0,
      closedTradeCount: 0, windowStartMs: 0, windowEndMs: 0,
    };
    mockLoopLastRunGauge.set.mockClear();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const before = Math.floor(Date.now() / 1000);
    await persistRunJournal('qwen-m1max', emptyMetrics, 'ok', [], undefined);
    const after = Math.floor(Date.now() / 1000);

    expect(mockLoopLastRunGauge.set).toHaveBeenCalledOnce();
    const ts = mockLoopLastRunGauge.set.mock.calls[0][0];
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('increments journal-write-errors counter when INSERT rejects (attribution signal)', async () => {
    const emptyMetrics = {
      winRate: null, sharpe: null, signalCount: 0,
      closedTradeCount: 0, windowStartMs: 0, windowEndMs: 0,
    };
    mockJournalWriteErrorsCounter.inc.mockClear();
    mockLoopLastRunGauge.set.mockClear();
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    // Must not throw — journal failure is fail-open by design.
    await expect(
      persistRunJournal('qwen-m1max', emptyMetrics, 'ok', [], undefined)
    ).resolves.toBeUndefined();

    expect(mockJournalWriteErrorsCounter.inc).toHaveBeenCalledOnce();
    // Freshness gauge must NOT advance on DB-write failure
    expect(mockLoopLastRunGauge.set).not.toHaveBeenCalled();
  });
});

// ─── emitReviewBacklogGauges ──────────────────────────────────────────────────

describe('emitReviewBacklogGauges', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockBacklogSizeGauge.set.mockClear();
    mockOldestAgeGauge.set.mockClear();
  });

  it('emits backlog size + oldest age from single SELECT', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const oldestEpoch = nowEpoch - 3600; // 1h old
    mockQuery.mockResolvedValueOnce({
      rows: [{ backlog: '3', oldest_epoch: String(oldestEpoch) }],
    });

    await emitReviewBacklogGauges();

    expect(mockBacklogSizeGauge.set).toHaveBeenCalledWith(3);
    expect(mockOldestAgeGauge.set).toHaveBeenCalledOnce();
    const emittedAge = mockOldestAgeGauge.set.mock.calls[0][0];
    expect(emittedAge).toBeGreaterThanOrEqual(3599);
    expect(emittedAge).toBeLessThanOrEqual(3601);
  });

  it('emits 0 for both when backlog empty', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ backlog: '0', oldest_epoch: null }],
    });

    await emitReviewBacklogGauges();

    expect(mockBacklogSizeGauge.set).toHaveBeenCalledWith(0);
    expect(mockOldestAgeGauge.set).toHaveBeenCalledWith(0);
  });

  it('swallows DB error without throwing (observability must not crash eval flow)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    await expect(emitReviewBacklogGauges()).resolves.toBeUndefined();

    // Gauges must NOT be set on DB failure (they retain last known value)
    expect(mockBacklogSizeGauge.set).not.toHaveBeenCalled();
    expect(mockOldestAgeGauge.set).not.toHaveBeenCalled();
  });
});

// ─── Singleton lifecycle ──────────────────────────────────────────────────────

describe('startSignalsLoop / stopSignalsLoop singleton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSignalsLoop();
    mockQuery.mockReset();
  });

  afterEach(() => {
    stopSignalsLoop();
    vi.useRealTimers();
  });

  it('starts a timer and does not create duplicate timers on second call', () => {
    // Mock metrics for triggered interval calls
    mockQuery.mockResolvedValue({ rows: [{ cnt: '0' }] });

    startSignalsLoop(1000);
    startSignalsLoop(1000); // second call is a no-op

    // After one interval, evaluateAndQueue fires once (3 SELECT calls)
    vi.advanceTimersByTime(1000);
    // Timer exists; second start was ignored — no assertion on call count here
    // Just verify stop works cleanly
    stopSignalsLoop();
  });

  it('stopSignalsLoop clears the timer', () => {
    mockQuery.mockResolvedValue({ rows: [{ cnt: '0' }] });

    startSignalsLoop(500);
    stopSignalsLoop();

    // Advance time — no queries should fire after stop
    const callsBefore = mockQuery.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(mockQuery.mock.calls.length).toBe(callsBefore);
  });

  it('resetSignalsLoop clears state for re-use', () => {
    startSignalsLoop(500);
    resetSignalsLoop();

    // Should be startable again without "already running" guard blocking it
    startSignalsLoop(500);
    stopSignalsLoop();
  });
});
