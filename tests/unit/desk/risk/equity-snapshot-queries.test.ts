import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/db/postgres-client', () => ({ getDbClient: (...args: unknown[]) => mockGetDbClient(...args) }));
vi.mock('../../../../src/shared/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });
const mockGetDbClient = vi.fn().mockReturnValue({ connect: mockConnect });

// Mock rowToSnapshot to return the row object directly so we can assert on the raw DB values.
vi.mock('../../../../src/desk/risk/equity-snapshot-types', () => ({
  rowToSnapshot: (row: Record<string, unknown>) => ({
    id: row.id,
    timestamp: row.timestamp,
    totalEquity: Number(row.total_equity),
    cashBalance: Number(row.cash_balance),
    unrealizedPnl: Number(row.unrealized_pnl),
    realizedPnlDaily: Number(row.realized_pnl_daily),
    openPositions: row.open_positions,
    drawdownPct: Number(row.drawdown_pct),
    metadata: row.metadata,
  }),
}));

const mockRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  timestamp: 1_600_000_000_000,
  total_equity: '1000',
  cash_balance: '500',
  unrealized_pnl: '100',
  realized_pnl_daily: '25',
  open_positions: 2,
  drawdown_pct: '1.5',
  metadata: {},
  ...overrides,
});

import { queryRecent, queryRange, queryDailyReturns, queryPrune } from '../../../../src/desk/risk/equity-snapshot-queries';
import { logger } from '../../../../src/shared/utils/logger';

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
  mockGetDbClient.mockReturnValue({ connect: mockConnect });
});

describe('queryRecent', () => {
  it('returns mapped snapshots ordered by timestamp desc', async () => {
    const row1 = mockRow({ id: 2, total_equity: '1100' });
    const row2 = mockRow({ id: 1, total_equity: '1000' });
    mockQuery.mockResolvedValue({ rows: [row1, row2], rowCount: 2 });

    const snapshots = await queryRecent(10);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].totalEquity).toBe(1100);
    expect(snapshots[1].totalEquity).toBe(1000);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY timestamp DESC'),
      [10],
    );
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no rows are found', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await queryRecent(1)).toEqual([]);
  });

  it('returns fallback array on query error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('conn refused'));
    const snapshots = await queryRecent(10);
    expect(snapshots).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs String(err) when the rejected value is not an Error', async () => {
    // Covers the `String(err)` fallback in safeQuery's catch (err instanceof Error === false)
    mockQuery.mockRejectedValueOnce('plain string failure');
    const snapshots = await queryRecent(10);
    expect(snapshots).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith('[EquitySnapshot] query failed', { cause: 'plain string failure' });
  });
});

describe('queryRange', () => {
  it('filters by timestamp range using inclusive bounds', async () => {
    mockQuery.mockResolvedValue({ rows: [mockRow()], rowCount: 1 });
    const from = 1_000_000_000_000;
    const to = 2_000_000_000_000;

    await queryRange(from, to);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE timestamp >= $1 AND timestamp <= $2'),
      [from, to],
    );
  });

  it('returns empty array on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    expect(await queryRange(0, 100)).toEqual([]);
  });
});

describe('queryDailyReturns', () => {
  const fixedNow = 1_600_100_000_000;
  let dateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('computes relative returns from the most recent to the oldest daily equity', async () => {
    // DISTINCT ON day query returns rows ordered day DESC.
    // total_equity: 1000 -> 1100 (10% return), then 1100 -> 1050 (-4.545% return)
    mockQuery.mockResolvedValue({
      rows: [
        { total_equity: '1050', day: '2024-01-03' },
        { total_equity: '1100', day: '2024-01-02' },
        { total_equity: '1000', day: '2024-01-01' },
      ],
      rowCount: 3,
    });

    const returns = await queryDailyReturns(30);

    // eq = [1050, 1100, 1000] (DESC order from DB)
    // eq.slice(1) = [1100, 1000]
    // returns[0] = (eq[0] - eq[1]) / eq[1] = (1050 - 1100) / 1100 = -0.045454...
    // returns[1] = (eq[1] - eq[2]) / eq[2] = (1100 - 1000) / 1000 = 0.1
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(-0.045454, 4);
    expect(returns[1]).toBeCloseTo(0.1, 4);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DISTINCT ON'),
      [fixedNow - 30 * 86_400_000],
    );
  });

  it('filters out non-positive equity values', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { total_equity: '100', day: 'd2' },
        { total_equity: '-50', day: 'd1' }, // negative -> filtered out
        { total_equity: '0', day: 'd0' },   // zero -> filtered out
      ],
      rowCount: 3,
    });

    // After filtering negative/zero: [100]. Slice(1) -> [].
    expect(await queryDailyReturns(7)).toEqual([]);
  });

  it('returns empty array on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    expect(await queryDailyReturns(7)).toEqual([]);
  });
});

describe('queryPrune', () => {
  const fixedNow = 1_700_000_000_000;
  let dateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('deletes snapshots older than maxDays and returns deleted count', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 42 });

    const deleted = await queryPrune(90);

    expect(deleted).toBe(42);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM equity_snapshots WHERE timestamp < $1',
      [fixedNow - 90 * 86_400_000],
    );
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when rowCount is null (driver quirk)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: null });
    expect(await queryPrune(30)).toBe(0);
  });

  it('returns 0 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    expect(await queryPrune(30)).toBe(0);
  });
});
