/**
 * Fake durable store for the quota-gate tests: one row per
 * (subscriber_id, period), mirroring the upserts the service issues.
 *
 * The row carries one counter per metered domain — API calls, trades, and MCU —
 * because the real table does. Keeping them separate here is what lets a test
 * prove that consuming one domain does not spend another's allowance.
 */

import { vi } from 'vitest';

export interface Row {
  calls_this_period: number;
  trades_this_period: number;
  trade_volume: number;
  mcu_this_period: number;
  period_limit: number;
  alerted_thresholds: number[];
}

/** A row with every counter at zero. */
function emptyRow(periodLimit: number): Row {
  return {
    calls_this_period: 0,
    trades_this_period: 0,
    trade_volume: 0,
    mcu_this_period: 0,
    period_limit: periodLimit,
    alerted_thresholds: [],
  };
}

export class FakeUsageStore {
  private rows = new Map<string, Row>();

  async run(sql: string, params: unknown[]): Promise<{ rows: Row[] }> {
    if (/^SELECT/i.test(sql)) {
      const row = this.rows.get(keyOf(params));
      return { rows: row ? [row] : [] };
    }
    if (/mcu_this_period/i.test(sql)) {
      return this.upsertMcu(params);
    }
    if (/trades_this_period/i.test(sql)) {
      return this.upsertTrade(params);
    }
    if (/^INSERT/i.test(sql)) {
      return this.upsertCall(params);
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }

  /** recordCall: (id, subscriber, period, period_limit, now) — one call. */
  private upsertCall(params: unknown[]): { rows: Row[] } {
    const key = keyOf(params);
    const existing = this.rows.get(key);
    if (existing) {
      existing.calls_this_period += 1;
      return { rows: [existing] };
    }
    const row = emptyRow(Number(params[3]));
    row.calls_this_period = 1;
    this.rows.set(key, row);
    return { rows: [row] };
  }

  /** recordTrade: (id, subscriber, period, volume, period_limit, now) — one trade. */
  private upsertTrade(params: unknown[]): { rows: Row[] } {
    const key = keyOf(params);
    const volume = Number(params[3]);
    const existing = this.rows.get(key);
    if (existing) {
      existing.trades_this_period += 1;
      existing.trade_volume += volume;
      return { rows: [existing] };
    }
    const row = emptyRow(Number(params[4]));
    row.trades_this_period = 1;
    row.trade_volume = volume;
    this.rows.set(key, row);
    return { rows: [row] };
  }

  /** recordMcu: (id, subscriber, period, mcu_used, period_limit, now) — n units. */
  private upsertMcu(params: unknown[]): { rows: Row[] } {
    const key = keyOf(params);
    const used = Number(params[3]);
    const existing = this.rows.get(key);
    if (existing) {
      existing.mcu_this_period += used;
      return { rows: [existing] };
    }
    const row = emptyRow(Number(params[4]));
    row.mcu_this_period = used;
    this.rows.set(key, row);
    return { rows: [row] };
  }

  /** Pre-load a call count so tests can reach the allowance without 1,000 writes. */
  seed(subscriberId: string, period: string, calls: number): void {
    const row = emptyRow(0);
    row.calls_this_period = calls;
    this.rows.set(`${subscriberId}|${period}`, row);
  }

  /** Pre-load an MCU count, for the same reason. */
  seedMcu(subscriberId: string, period: string, mcu: number): void {
    const row = emptyRow(0);
    row.mcu_this_period = mcu;
    this.rows.set(`${subscriberId}|${period}`, row);
  }

  /** Mark a threshold as already alerted, to test the durable dedup. */
  seedAlertedThresholds(subscriberId: string, period: string, thresholds: number[]): void {
    const row = this.rows.get(`${subscriberId}|${period}`) ?? emptyRow(0);
    row.alerted_thresholds = thresholds;
    this.rows.set(`${subscriberId}|${period}`, row);
  }

  read(subscriberId: string, period: string): number | undefined {
    return this.rows.get(`${subscriberId}|${period}`)?.calls_this_period;
  }

  readMcu(subscriberId: string, period: string): number | undefined {
    return this.rows.get(`${subscriberId}|${period}`)?.mcu_this_period;
  }

  readAlertedThresholds(subscriberId: string, period: string): number[] | undefined {
    return this.rows.get(`${subscriberId}|${period}`)?.alerted_thresholds;
  }
}

function keyOf(params: unknown[]): string {
  // Every upsert leads with a row id, so subscriber_id and period sit at index
  // 1-2; the SELECT passes them at index 0-1.
  const offset = params.length >= 3 ? 1 : 0;
  return `${String(params[offset])}|${String(params[offset + 1])}`;
}

/** A mock of `query` wired to the given store. */
export function mockQuery(store: FakeUsageStore): ReturnType<typeof vi.fn> {
  return vi.fn((sql: string, params: unknown[]) => store.run(sql, params ?? []));
}
