/**
 * Polymarket kill switch.
 *
 * Once fired, the switch latches: `isFired()` stays true until an explicit
 * `reset()`. Firing is idempotent — a second `fire()` issues no second
 * cancel-all but is still recorded in the audit trail, because "someone asked
 * us to stop" is a fact worth keeping even when the stop already happened.
 *
 * The transport is injected so tests never touch the network. The default
 * factory below is the production wiring; it has NOT been verified against the
 * live endpoint (no credentials in this repo), so treat it as unproven until a
 * signed request is observed succeeding.
 */

export interface PolyCancelAllResult {
  ok: boolean;
  status: number;
  body?: string;
}

export interface PolyCancelAllRequest {
  reason: string;
  /** Epoch ms the switch fired, supplied by the switch's clock. */
  firedAtMs: number;
}

export type PolyCancelAllTransport = (req: PolyCancelAllRequest) => Promise<PolyCancelAllResult>;

export type PolyKillSwitchAuditKind = 'fired' | 'idempotent-replay' | 'reset';

export interface PolyKillSwitchAuditEntry {
  kind: PolyKillSwitchAuditKind;
  atMs: number;
  reason: string;
  /** Absent on a replay that issued no request, and on reset. */
  outcome?: 'ok' | 'failed';
  status?: number;
  body?: string;
  error?: string;
}

export interface PolyKillSwitchFireResult {
  /** True when this call issued the cancel-all; false on an idempotent replay. */
  issued: boolean;
  /** Transport result, present only when `issued` is true. */
  result?: PolyCancelAllResult;
}

export interface PolyKillSwitchOptions {
  cancelAll: PolyCancelAllTransport;
  /** Clock function. Defaults to `() => Date.now()`. */
  now?: () => number;
  /** Alternative clock object; `now` wins when both are supplied. */
  clock?: { now(): number };
}

export interface PolyKillSwitch {
  fire(reason: string): Promise<PolyKillSwitchFireResult>;
  isFired(): boolean;
  getAudit(): PolyKillSwitchAuditEntry[];
  reset(): void;
}

export function createPolyKillSwitch(opts: PolyKillSwitchOptions): PolyKillSwitch {
  const clock = opts.now ?? (opts.clock ? () => opts.clock!.now() : () => Date.now());
  const cancelAll = opts.cancelAll;
  const audit: PolyKillSwitchAuditEntry[] = [];
  let fired = false;

  return {
    isFired: () => fired,

    getAudit: () => audit.map((entry) => ({ ...entry })),

    async fire(reason: string): Promise<PolyKillSwitchFireResult> {
      const atMs = clock();
      if (fired) {
        // Latch already engaged: record the attempt, issue nothing.
        audit.push({ kind: 'idempotent-replay', atMs, reason });
        return { issued: false };
      }
      // Latch synchronously, before any await, so concurrent callers cannot
      // both slip past the guard and issue two cancel-alls.
      fired = true;
      try {
        const result = await cancelAll({ reason, firedAtMs: atMs });
        audit.push({
          kind: 'fired',
          atMs,
          reason,
          outcome: result.ok ? 'ok' : 'failed',
          status: result.status,
          body: result.body,
        });
        return { issued: true, result };
      } catch (err) {
        // A failed cancel-all leaves the switch latched: fail closed.
        const message = err instanceof Error ? err.message : String(err);
        audit.push({ kind: 'fired', atMs, reason, outcome: 'failed', error: message });
        return { issued: true, result: { ok: false, status: 0, body: message } };
      }
    },

    reset(): void {
      const atMs = clock();
      fired = false;
      audit.push({ kind: 'reset', atMs, reason: 'manual reset' });
    },
  };
}

export interface PolyCancelAllTransportOptions {
  /** Injected fetch; defaults to the global. */
  fetchImpl?: typeof fetch;
  /** Static auth headers. Never read from code. */
  headers?: Record<string, string>;
  /** Dynamic header builder invoked on each cancel-all so timestamps and L2 HMAC signatures stay fresh. */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Defaults to `https://clob.polymarket.com`. */
  host?: string;
}

/**
 * Default CLOB cancel-all transport: `DELETE {host}/cancel-all`.
 *
 * Callers supply static `headers` and/or per-request `getHeaders`; nothing is hardcoded here.
 */
export function createPolyCancelAllTransport(
  options: PolyCancelAllTransportOptions = {},
): PolyCancelAllTransport {
  const host = (options.host ?? 'https://clob.polymarket.com').replace(/\/+$/, '');
  return async () => {
    const doFetch = options.fetchImpl ?? fetch;
    const dynamicHeaders = options.getHeaders ? await options.getHeaders() : undefined;
    const response = await doFetch(`${host}/cancel-all`, {
      method: 'DELETE',
      headers: { ...(options.headers ?? {}), ...(dynamicHeaders ?? {}) },
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  };
}
