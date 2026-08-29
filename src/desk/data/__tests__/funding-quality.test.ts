/**
 * Tests for funding-quality — validateFundingQuality data-quality checks.
 *
 * getDbClient is mocked so no DB is needed. Each query returns a fixed
 * row-count; the function is pure aggregation, so we assert the parsed
 * report plus the SQL it issues.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetDbClient, mockLogger } = vi.hoisted(() => ({
  mockGetDbClient: vi.fn(),
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../db/postgres-client', () => ({ getDbClient: mockGetDbClient }));
vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

import { validateFundingQuality } from '../funding-quality';

function mockPool(rows: Array<Record<string, unknown>>) {
  let i = 0;
  const query = vi.fn().mockImplementation(() => {
    const row = rows[i];
    i++;
    return Promise.resolve({ rows: row ? [row] : [{}] });
  });
  return { query };
}

describe('validateFundingQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a full report from the six queries', async () => {
    mockGetDbClient.mockReturnValue(mockPool([
      { cnt: '100' }, { cnt: '2' }, { cnt: '0' }, { cnt: '1' }, { cnt: '3' },
      { min: '2024-01-01', max: '2024-01-02' },
    ]));

    const report = await validateFundingQuality('BTCUSDT');

    expect(report).toEqual({
      totalRows: 100,
      duplicateCount: 2,
      monotonicViolations: 0,
      rateAnomalies: 1,
      coverageGaps: 3,
      oldest: '2024-01-01',
      newest: '2024-01-02',
    });
  });

  it('defaults exchange to binance-futures', async () => {
    mockGetDbClient.mockReturnValue(mockPool([{ cnt: '0' }, { cnt: '0' }, { cnt: '0' }, { cnt: '0' }, { cnt: '0' }, { min: null, max: null }]));

    const report = await validateFundingQuality('ETHUSDT');

    expect(report.totalRows).toBe(0);
    expect(report.oldest).toBeNull();
    expect(report.newest).toBeNull();
    // the default exchange must appear in every query's param list
    const params = mockGetDbClient.mock.results[0].value.query.mock.calls.map((c) => c[1] as string[]);
    expect(params.every((p) => p[1] === 'binance-futures')).toBe(true);
    expect(params.every((p) => p[0] === 'ETHUSDT')).toBe(true);
  });

  it('passes the exchange argument through to every query', async () => {
    mockGetDbClient.mockReturnValue(mockPool([{ cnt: '0' }, { cnt: '0' }, { cnt: '0' }, { cnt: '0' }, { cnt: '0' }, { min: null, max: null }]));

    await validateFundingQuality('BTCUSDT', 'bybit-linear');

    const params = mockGetDbClient.mock.results[0].value.query.mock.calls.map((c) => c[1] as string[]);
    expect(params.every((p) => p[1] === 'bybit-linear')).toBe(true);
    expect(params.every((p) => p[0] === 'BTCUSDT')).toBe(true);
  });

  it('treats an empty row as zero counts', async () => {
    mockGetDbClient.mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [{}] }),
    });

    const report = await validateFundingQuality('BTCUSDT');

    expect(report).toEqual({
      totalRows: 0,
      duplicateCount: 0,
      monotonicViolations: 0,
      rateAnomalies: 0,
      coverageGaps: 0,
      oldest: null,
      newest: null,
    });
  });
});
