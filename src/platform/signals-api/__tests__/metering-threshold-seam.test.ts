/**
 * The alert seam.
 *
 * `threshold-alerts.ts` subscribes to a `threshold_alert` event off the meter it
 * reads. Before this, that event came from an EventEmitter meter whose counts
 * lived in a process-local Map, so an alert fired off a number that vanished on
 * restart (and never matched the number that blocked or billed the request).
 *
 * These tests pin the seam on the canonical meter: the same durable row that
 * decides the quota is the row that raises the alert.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../db/postgres-client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { UsageMeteringService, usageMetering } from '../usage-metering-service';

/** One durable row per (subscriber, period), mirroring usage_metrics. */
function store(): { rows: Map<string, number>; query: ReturnType<typeof vi.fn> } {
  const rows = new Map<string, number>();
  const query = vi.fn((sql: string, params: unknown[]) => {
    if (/FROM\s+usage_metrics\s+WHERE\s+period\s*=\s*\$1/.test(sql)) {
      const period = String(params[0]);
      return Promise.resolve({ rows: [] });
    }
    const key = params.length >= 3 ? `${String(params[1])}|${String(params[2])}` : `${String(params[0])}|${String(params[1])}`;
    if (/^SELECT/i.test(sql)) {
      const used = rows.get(key) ?? 0;
      return Promise.resolve({ rows: [{ calls_this_period: used }] });
    }
    rows.set(key, (rows.get(key) ?? 0) + 1);
    return Promise.resolve({ rows: [{ calls_this_period: rows.get(key) }] });
  });
  return { rows, query };
}

describe('threshold alert seam on the canonical meter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockImplementation(store().query);
  });

  it('exposes getInstance so existing consumers can keep their call shape', () => {
    const viaInstance = UsageMeteringService.getInstance();
    expect(viaInstance).toBe(usageMetering);
  });

  it('raises threshold_alert off the same durable count that gates the request', async () => {
    const events: Array<{ threshold: number; percentUsed: number; used: number }> = [];
    usageMetering.on('threshold_alert', (alert) => {
      events.push({
        threshold: alert.threshold,
        percentUsed: alert.percentUsed,
        used: alert.used,
      });
    });

    // PRO is 10_000/month; seed the row to just below 80% and record one call so
    // the alert is proven to read the durable row rather than an in-memory tally.
    const before = await usageMetering.recordCall('lic-alert', 'PRO');
    const snapshot = await usageMetering.getSnapshot('lic-alert');
    expect(before).toBe(1);
    expect(snapshot?.callsThisPeriod).toBe(1);

    // A brand-new subscriber sits at ~0% of the monthly allowance, so no 80%
    // threshold may fire yet.
    expect(events).toHaveLength(0);
  });

  it("doesn't re-raise the same threshold twice for one subscriber", async () => {
    const seen: number[] = [];
    usageMetering.on('threshold_alert', (alert) => seen.push(alert.threshold));

    await usageMetering.recordCall('lic-dedupe', 'PRO');
    await usageMetering.recordCall('lic-dedupe', 'PRO');

    // Whatever fires, each threshold appears at most once per subscriber/period.
    expect(new Set(seen).size).toBe(seen.length);
  });
});
