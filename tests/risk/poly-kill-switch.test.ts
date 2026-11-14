import { describe, expect, it, vi } from 'vitest';
import {
  createPolyCancelAllTransport,
  createPolyKillSwitch,
  type PolyCancelAllTransport,
} from '../../src/desk/risk/poly-kill-switch';

function makeTransport(result: { ok: boolean; status: number; body?: string } = { ok: true, status: 200 }) {
  return vi.fn<PolyCancelAllTransport>(async () => result);
}

/** Deterministic, hand-driven clock so timestamps are exact in assertions. */
function makeClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    advance: (deltaMs: number) => {
      current += deltaMs;
    },
  };
}

describe('createPolyKillSwitch — fire', () => {
  it('issues exactly one cancel-all on the first fire', async () => {
    const cancelAll = makeTransport();
    const clock = makeClock();
    const kill = createPolyKillSwitch({ cancelAll, clock });

    expect(kill.isFired()).toBe(false);
    const outcome = await kill.fire('drawdown breach');

    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(cancelAll).toHaveBeenCalledWith({ reason: 'drawdown breach', firedAtMs: 1_000 });
    expect(outcome.issued).toBe(true);
    expect(outcome.result).toEqual({ ok: true, status: 200 });
    expect(kill.isFired()).toBe(true);
  });

  it('issues no second cancel-all when fired twice', async () => {
    const cancelAll = makeTransport();
    const clock = makeClock();
    const kill = createPolyKillSwitch({ cancelAll, clock });

    await kill.fire('first');
    clock.advance(500);
    const second = await kill.fire('second');

    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(second.issued).toBe(false);
    expect(kill.isFired()).toBe(true);
  });

  it('records the idempotent attempt in the audit trail', async () => {
    const clock = makeClock();
    const kill = createPolyKillSwitch({ cancelAll: makeTransport(), clock });

    await kill.fire('first');
    clock.advance(500);
    await kill.fire('second');

    const audit = kill.getAudit();
    expect(audit.map((e) => e.kind)).toEqual(['fired', 'idempotent-replay']);
    expect(audit[0]).toMatchObject({ kind: 'fired', atMs: 1_000, reason: 'first', outcome: 'ok', status: 200 });
    expect(audit[1]).toMatchObject({ kind: 'idempotent-replay', atMs: 1_500, reason: 'second' });
    expect(audit[1]?.outcome).toBeUndefined();
  });

  it('keeps the latch engaged when the transport reports failure', async () => {
    const cancelAll = makeTransport({ ok: false, status: 401, body: 'unauthorized' });
    const kill = createPolyKillSwitch({ cancelAll, now: () => 42 });

    const outcome = await kill.fire('manual');

    expect(outcome.issued).toBe(true);
    expect(outcome.result?.ok).toBe(false);
    expect(kill.isFired()).toBe(true);
    expect(kill.getAudit()[0]).toMatchObject({ outcome: 'failed', status: 401, body: 'unauthorized' });
  });

  it('stays latched and records the error when the transport throws', async () => {
    const cancelAll = vi.fn<PolyCancelAllTransport>(async () => {
      throw new Error('network down');
    });
    const kill = createPolyKillSwitch({ cancelAll, now: () => 7 });

    const outcome = await kill.fire('manual');

    expect(outcome.issued).toBe(true);
    expect(outcome.result).toMatchObject({ ok: false, status: 0, body: 'network down' });
    expect(kill.isFired()).toBe(true);
    expect(kill.getAudit()[0]).toMatchObject({ outcome: 'failed', error: 'network down' });
  });

  it('issues one cancel-all even when two fires race', async () => {
    const cancelAll = makeTransport();
    const kill = createPolyKillSwitch({ cancelAll, now: () => 1 });

    const [a, b] = await Promise.all([kill.fire('one'), kill.fire('two')]);

    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect([a.issued, b.issued].filter(Boolean)).toHaveLength(1);
  });
});

describe('createPolyKillSwitch — reset', () => {
  it('clears the latch but keeps history and audits the reset', async () => {
    const clock = makeClock();
    const kill = createPolyKillSwitch({ cancelAll: makeTransport(), clock });
    await kill.fire('first');

    clock.advance(100);
    kill.reset();

    expect(kill.isFired()).toBe(false);
    expect(kill.getAudit().map((e) => e.kind)).toEqual(['fired', 'reset']);
    expect(kill.getAudit()[1]).toMatchObject({ kind: 'reset', atMs: 1_100 });
  });

  it('allows a new cancel-all after reset', async () => {
    const cancelAll = makeTransport();
    const kill = createPolyKillSwitch({ cancelAll, now: () => 5 });

    await kill.fire('first');
    kill.reset();
    const outcome = await kill.fire('after reset');

    expect(cancelAll).toHaveBeenCalledTimes(2);
    expect(outcome.issued).toBe(true);
    expect(kill.isFired()).toBe(true);
  });

  it('returns copies from getAudit so callers cannot mutate history', async () => {
    const kill = createPolyKillSwitch({ cancelAll: makeTransport(), now: () => 1 });
    await kill.fire('first');

    const first = kill.getAudit();
    first[0]!.reason = 'tampered';
    expect(kill.getAudit()[0]?.reason).toBe('first');
  });
});

describe('createPolyCancelAllTransport', () => {
  it('issues DELETE /cancel-all with only the supplied headers', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"canceled":[]}', { status: 200 }));
    const transport = createPolyCancelAllTransport({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      headers: { POLY_API_KEY: 'key-from-caller' },
    });

    const result = await transport({ reason: 'test', firedAtMs: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://clob.polymarket.com/cancel-all');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ POLY_API_KEY: 'key-from-caller' });
    expect(result).toEqual({ ok: true, status: 200, body: '{"canceled":[]}' });
  });

  it('defaults to an empty header set when none are supplied', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    const transport = createPolyCancelAllTransport({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await transport({ reason: 'test', firedAtMs: 1 });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({});
    expect(result).toEqual({ ok: false, status: 401, body: '' });
  });

  it('evaluates getHeaders dynamically on every request so signatures never go stale', async () => {
    let seq = 100;
    const fetchImpl = vi.fn(async () => new Response('{"canceled":["o1"]}', { status: 200 }));
    const transport = createPolyCancelAllTransport({
      host: 'https://clob.polymarket.com/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      headers: { 'X-Static': '1' },
      getHeaders: () => {
        seq += 1;
        return { 'POLY-TIMESTAMP': String(seq) };
      },
    });

    await transport({ reason: 'first', firedAtMs: 1_000 });
    await transport({ reason: 'second', firedAtMs: 2_000 });

    const [url1, init1] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const [, init2] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url1).toBe('https://clob.polymarket.com/cancel-all');
    expect(init1.headers).toEqual({ 'X-Static': '1', 'POLY-TIMESTAMP': '101' });
    expect(init2.headers).toEqual({ 'X-Static': '1', 'POLY-TIMESTAMP': '102' });
  });
});
