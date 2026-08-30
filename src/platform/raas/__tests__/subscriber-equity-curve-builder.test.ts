/**
 * Tests for SubscriberEquityCurveBuilder — mocks tenantQuery (which wraps postgres
 * query) so build() can be exercised end-to-end with synthetic daily PnL rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/db/postgres-client', () => ({
  query: vi.fn(),
}));

const { mockTenantQuery, mockBuildTenantFilter } = vi.hoisted(() => ({
  mockTenantQuery: vi.fn(),
  mockBuildTenantFilter: vi.fn(() => ({ clause: 'AND subscriber_id = $3', params: ['sub-1'] })),
}));

vi.mock('../subscriber-tenant-isolator', () => ({
  buildTenantFilter: vi.fn((...args: unknown[]) => mockBuildTenantFilter(...args)),
  tenantQuery: vi.fn((...args: unknown[]) => mockTenantQuery(...args)),
}));

import { SubscriberEquityCurveBuilder } from '../subscriber-equity-curve-builder';

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface DailyRow {
  day: string;
  net_pnl: string;
}

const START = 1_700_000_000_000; // 2023-11-14
const END = 1_700_864_000_000;

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SubscriberEquityCurveBuilder', () => {
  let builder: SubscriberEquityCurveBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    builder = new SubscriberEquityCurveBuilder();
  });

  it('builds a single-day curve with positive pnl', async () => {
    const rows: DailyRow[] = [{ day: '2026-01-01', net_pnl: '5.25' }];
    mockTenantQuery.mockResolvedValueOnce({ rows });

    const result = await builder.build('sub-1', START, END);

    expect(result.subscriberId).toBe('sub-1');
    expect(result.startingCapital).toBe(10_000);
    expect(result.currentNav).toBe(10_005.25);
    expect(result.totalReturn).toBeCloseTo(0.000525, 6);
    expect(result.maxDrawdown).toBe(0);
    expect(result.curve).toEqual([
      { date: '2026-01-01', nav: 10_005.25, dailyPnl: 5.25 },
    ]);
    expect(mockTenantQuery).toHaveBeenCalledTimes(1);
  });

  it('builds cumulative curve over multiple days', async () => {
    const rows: DailyRow[] = [
      { day: '2026-01-01', net_pnl: '10.00' },
      { day: '2026-01-02', net_pnl: '-5.50' },
      { day: '2026-01-03', net_pnl: '3.25' },
    ];
    mockTenantQuery.mockResolvedValueOnce({ rows });

    const result = await builder.build('sub-1', START, END);

    expect(result.currentNav).toBe(10_007.75);
    expect(result.curve).toHaveLength(3);
    expect(result.curve[0].nav).toBe(10_010);
    expect(result.curve[1].nav).toBe(10_004.5);
    expect(result.curve[2].nav).toBe(10_007.75);
    expect(result.curve[2].dailyPnl).toBe(3.25);
  });

  it('computes max drawdown from synthetic drop', async () => {
    const rows: DailyRow[] = [
      { day: '2026-01-01', net_pnl: '100.00' }, // nav 10100
      { day: '2026-01-02', net_pnl: '-500.00' }, // nav 9600 → drawdown
    ];
    mockTenantQuery.mockResolvedValueOnce({ rows });

    const result = await builder.build('sub-1', START, END);

    // peak = 10100, trough = 9600 → dd = 500 / 10100 ≈ 0.0495
    expect(result.maxDrawdown).toBeCloseTo(500 / 10100, 6);
    expect(result.maxDrawdown).toBeGreaterThan(0.04);
    expect(result.maxDrawdown).toBeLessThan(0.05);
  });

  it('computes maxDrawdown as 0 when NAV always rises', async () => {
    const rows: DailyRow[] = [
      { day: '2026-01-01', net_pnl: '100.00' },
      { day: '2026-01-02', net_pnl: '200.00' },
      { day: '2026-01-03', net_pnl: '50.00' },
    ];
    mockTenantQuery.mockResolvedValueOnce({ rows });

    const result = await builder.build('sub-1', START, END);

    expect(result.maxDrawdown).toBe(0);
  });

  it('handles empty rows (no trades in period)', async () => {
    mockTenantQuery.mockResolvedValueOnce({ rows: [] });

    const result = await builder.build('sub-1', START, END);

    expect(result.currentNav).toBe(10_000);
    expect(result.totalReturn).toBe(0);
    expect(result.maxDrawdown).toBe(0);
    expect(result.curve).toEqual([]);
  });

  it('uses custom startingCapital', async () => {
    mockTenantQuery.mockResolvedValueOnce({ rows: [{ day: '2026-01-01', net_pnl: '0.00' }] });

    const result = await builder.build('sub-1', START, END, 50_000);

    expect(result.startingCapital).toBe(50_000);
    expect(result.currentNav).toBe(50_000);
  });

  it('handles null net_pnl as zero', async () => {
    mockTenantQuery.mockResolvedValueOnce({
      rows: [{ day: '2026-01-01', net_pnl: null as unknown as string }],
    });

    const result = await builder.build('sub-1', START, END);

    expect(result.curve[0].dailyPnl).toBe(0);
    expect(result.curve[0].nav).toBe(10_000);
  });

  it('passes subscriberId and time range to tenantQuery', async () => {
    mockTenantQuery.mockResolvedValueOnce({ rows: [] });

    await builder.build('sub-42', START, END);

    expect(mockTenantQuery).toHaveBeenCalledTimes(1);
    const [sql, params, filter] = mockTenantQuery.mock.calls[0];
    expect(sql).toContain('FROM trades');
    expect(sql).toContain('WHERE created_at BETWEEN $1 AND $2');
    expect(sql).toContain('status = \'FILLED\'');
    expect(sql).toContain('GROUP BY');
    expect(params).toEqual([START, END]);
    expect(filter).toBeDefined(); // the mock buildTenantFilter result
  });

  it('extracts date prefix from day value', async () => {
    // DATE_TRUNC('day', ...) returns a Postgres timestamptz like '2026-06-15 00:00:00+00'
    // and the builder splits on 'T' (ISO form) to get the date prefix.
    mockTenantQuery.mockResolvedValueOnce({
      rows: [{ day: '2026-06-15T00:00:00+00', net_pnl: '1.00' }],
    });

    const result = await builder.build('sub-1', START, END);

    expect(result.curve[0].date).toBe('2026-06-15');
  });

  it('computes totalReturn as fraction of startingCapital', async () => {
    mockTenantQuery.mockResolvedValueOnce({
      rows: [{ day: '2026-01-01', net_pnl: '500.00' }],
    });

    const result = await builder.build('sub-1', START, END, 10_000);

    expect(result.totalReturn).toBeCloseTo(0.05, 6);
  });

  it('returns 0 totalReturn when startingCapital is 0', async () => {
    mockTenantQuery.mockResolvedValueOnce({
      rows: [{ day: '2026-01-01', net_pnl: '100.00' }],
    });

    const result = await builder.build('sub-1', START, END, 0);

    expect(result.totalReturn).toBe(0);
    expect(result.currentNav).toBe(100);
  });
});

// ─── computeMaxDrawdown edge cases (via build) ──────────────────────────────

describe('SubscriberEquityCurveBuilder maxDrawdown edge cases', () => {
  let builder: SubscriberEquityCurveBuilder;
  beforeEach(() => {
    vi.clearAllMocks();
    builder = new SubscriberEquityCurveBuilder();
  });

  it('maxDrawdown peaks and troughs correctly with recovery', async () => {
    const rows: DailyRow[] = [
      { day: '2026-01-01', net_pnl: '100.00' },  // nav 10100
      { day: '2026-01-02', net_pnl: '-200.00' },  // nav 9900 (dd 200/10100)
      { day: '2026-01-03', net_pnl: '300.00' },   // nav 10200 (peak updated)
      { day: '2026-01-04', net_pnl: '-500.00' },  // nav 9700 (dd 500/10200)
    ];
    mockTenantQuery.mockResolvedValueOnce({ rows });

    const result = await builder.build('sub-1', START, END);

    // max dd should be 500/10200 ≈ 0.049
    expect(result.maxDrawdown).toBeCloseTo(500 / 10200, 6);
  });

  it('maxDrawdown handles single point (no drawdown possible)', async () => {
    mockTenantQuery.mockResolvedValueOnce({
      rows: [{ day: '2026-01-01', net_pnl: '100.00' }],
    });

    const result = await builder.build('sub-1', START, END);

    expect(result.maxDrawdown).toBe(0);
  });
});
