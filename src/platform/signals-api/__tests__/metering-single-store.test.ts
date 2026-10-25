/**
 * One meter, one store.
 *
 * Before this, five meters ran in parallel: a subscriber API-call meter on
 * Postgres, two EventEmitter meters keyed by license (one on Redis for trades,
 * one in a Map for daily calls), and a desk-side MCU/quota meter. A customer was
 * therefore a different entity in each store, and the numbers that blocked a
 * request and the numbers that billed it were computed by different code.
 *
 * These tests pin the single-store contract: the same meter records the API
 * call, the trade volume, and the quota allowance, and every one of those
 * counters is read back from the same durable row.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../db/postgres-client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { UsageMeteringService, usageMetering } from '../usage-metering-service';

interface Row {
  calls_this_period: number;
  trades_this_period: number;
  trade_volume: number;
  period_limit: number;
}

/** In-memory stand-in for usage_metrics: one row per (subscriber, period). */
function store(): { rows: Map<string, Row>; query: ReturnType<typeof vi.fn> } {
  const rows = new Map<string, Row>();
  const query = vi.fn((sql: string, params: unknown[]) => {
    // Single-subscriber statements key on (subscriber_id, period); the
    // per-period dashboard scan filters on period alone.
    if (/FROM\s+usage_metrics\s+WHERE\s+period\s*=\s*\$1/.test(sql)) {
      const period = String(params[0]);
      const matches = [...rows.entries()].filter(([k]) => k.endsWith(`|${period}`));
      return Promise.resolve({
        rows: matches.map(([k, r]) => ({ subscriber_id: k.split('|')[0], ...r })),
      });
    }
    const key = params.length >= 3 ? `${String(params[1])}|${String(params[2])}` : `${String(params[0])}|${String(params[1])}`;
    if (/^SELECT/i.test(sql)) {
      const row = rows.get(key);
      return Promise.resolve({ rows: row ? [row] : [] });
    }
    const row = rows.get(key) ?? {
      calls_this_period: 0,
      trades_this_period: 0,
      trade_volume: 0,
      period_limit: Number(params[3] ?? 0),
    };
    // The service writes EXCLUDED.trade_volume on insert and
    // usage_metrics.trade_volume + EXCLUDED.trade_volume on conflict.
    const volume = Number(row.trade_volume ?? 0);
    if (/calls_this_period = usage_metrics/.test(sql)) row.calls_this_period += 1;
    else if (/calls_this_period\)/i.test(sql) && /VALUES/i.test(sql)) row.calls_this_period += 1;
    if (/trades_this_period = usage_metrics/.test(sql)) row.trades_this_period += 1;
    else if (/trades_this_period\)/i.test(sql) && /VALUES/i.test(sql)) row.trades_this_period += 1;
    if (/trade_volume = usage_metrics/.test(sql)) row.trade_volume = volume + Number(params[3] ?? 0);
    else if (/trade_volume\)/i.test(sql) && /VALUES/i.test(sql)) row.trade_volume = volume + Number(params[3] ?? 0);
    rows.set(key, row);
    return Promise.resolve({ rows: [row] });
  });
  return { rows, query };
}

describe('single metering store', () => {
  let rows: Map<string, Row>;
  let query: ReturnType<typeof vi.fn>;
  let service: UsageMeteringService;

  beforeEach(() => {
    vi.clearAllMocks();
    const s = store();
    rows = s.rows;
    query = s.query;
    service = new UsageMeteringService();
    queryMock.mockImplementation(query);
  });

  it('records an API call against the same row it reads the allowance from', async () => {
    const recorded = await service.recordCall('lic-1', 'PRO');
    const decision = await service.check('lic-1', 'PRO');
    expect(recorded).toBe(1);
    expect(decision.used).toBe(recorded);
    expect(decision.remaining).toBe(decision.limit - recorded);
  });

  it('records a trade against the same subscriber row', async () => {
    await service.recordTrade('lic-1', 'PRO', 1_500);
    await service.recordTrade('lic-1', 'PRO', 500);
    const metrics = await service.getMetrics('lic-1');
    expect(metrics.totalTrades).toBe(2);
    expect(metrics.totalVolume).toBe(2_000);
  });

  it('counts an API call and a trade on the same row without mixing the units', async () => {
    await service.recordCall('lic-1', 'PRO');
    await service.recordTrade('lic-1', 'PRO', 250);
    const decision = await service.check('lic-1', 'PRO');
    const metrics = await service.getMetrics('lic-1');
    expect(decision.used).toBe(1);
    expect(metrics.totalTrades).toBe(1);
    expect(metrics.totalVolume).toBe(250);
  });

  it('exposes the MCU allowance a license key is entitled to', async () => {
    const enterprise = service.getQuotaAllocation('ENTERPRISE');
    expect(enterprise.monthlyQuota).toBe(100_000);
    expect(enterprise.dailyQuota).toBe(10_000);
    expect(enterprise.tier).toBe('ENTERPRISE');

    // An unlimited tier is declared with a negative allowance, not a huge number.
    const master = service.getQuotaAllocation('MASTER');
    expect(master.monthlyQuota).toBeLessThan(0);
    expect(master.tier).toBe('MASTER');
  });

  it('keeps the module-level meter a singleton so callers share one store', () => {
    expect(usageMetering).toBeInstanceOf(UsageMeteringService);
    expect(service).not.toBe(usageMetering);
  });

  it('resolves a tier from the canonical vocabulary', () => {
    // Every tier must resolve to its price-book allowance, not the FREE default;
    // MASTER is declared unlimited, which is a negative allowance.
    expect(service.getTierLimits('STARTER').monthlyLimit).toBe(5_000);
    expect(service.getTierLimits('MASTER').monthlyLimit).toBeLessThan(0);
    for (const tier of ['FREE', 'STARTER', 'PRO', 'ENTERPRISE']) {
      expect(service.getTierLimits(tier).monthlyLimit, `limit for ${tier}`).toBeGreaterThan(0);
    }
  });

  it('reports usage rows for every subscriber, for the revenue dashboard', async () => {
    await service.recordCall('lic-a', 'PRO');
    await service.recordCall('lic-b', 'PRO');
    const all = await service.getAllUsageData();
    expect(all.map((u) => u.subscriberId).sort()).toEqual(['lic-a', 'lic-b']);
    // The dashboard needs the tier and the real limit, not a placeholder.
    expect(all.every((u) => u.tier === 'PRO' && u.monthlyLimit === 10_000)).toBe(true);
  });
});
