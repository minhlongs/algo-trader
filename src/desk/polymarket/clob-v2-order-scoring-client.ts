/**
 * Polymarket CLOB V2 — Order-Scoring Client & HTTP 425 Restart Cooldown Surface.
 *
 * Verifies whether resting `QUIET` maker quotes are actively earning Quadratic
 * Liquidity Rewards via `GET {host}/order-scoring?order_id=...` (and batch
 * `POST {host}/orders-scoring`), while feeding every HTTP 425 response into
 * `EngineRestartCooldown` (120-second post-only window).
 */

import {
  ENGINE_RESTARTING_HTTP_STATUS,
  type ClobV2OrderIntent,
  type ClobV2OrderValidation,
} from './clob-v2-venue-constants';
import {
  EngineRestartCooldown,
  classifyClobV2SubmitResponse,
  gateOrderThroughCooldown,
  type ClobV2SubmitOutcome,
} from './clob-v2-submit-classifier';

export interface ClobV2OrderScoringClientOptions {
  host?: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  getHeaders?: (method: 'GET' | 'POST', path: string, body?: string) => Record<string, string> | Promise<Record<string, string>>;
  cooldown?: EngineRestartCooldown;
  nowMs?: () => number;
}

export interface OrderScoringCheckResult {
  ok: boolean;
  orderId: string;
  scoring: boolean;
  status: number;
  engineRestarting: boolean;
  postOnlyRemainingMs: number;
  error?: string;
}

export interface BatchOrdersScoringResult {
  ok: boolean;
  scores: Record<string, boolean>;
  status: number;
  engineRestarting: boolean;
  postOnlyRemainingMs: number;
  error?: string;
}

export class ClobV2OrderScoringClient {
  readonly cooldown: EngineRestartCooldown;
  private readonly host: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly headers?: Record<string, string>;
  private readonly getHeaders?: ClobV2OrderScoringClientOptions['getHeaders'];
  private readonly clock: () => number;

  constructor(options: ClobV2OrderScoringClientOptions = {}) {
    this.host = (options.host ?? 'https://clob.polymarket.com').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl;
    this.headers = options.headers;
    this.getHeaders = options.getHeaders;
    this.cooldown = options.cooldown ?? new EngineRestartCooldown();
    this.clock = options.nowMs ?? (() => Date.now());
  }

  async checkOrderScoring(orderId: string): Promise<OrderScoringCheckResult> {
    const trimmed = orderId.trim();
    const now = this.clock();
    if (!trimmed) {
      return {
        ok: false, orderId: '', scoring: false, status: 0,
        engineRestarting: false, postOnlyRemainingMs: this.cooldown.remainingMs(now),
        error: 'orderId must be non-empty',
      };
    }

    const path = `/order-scoring?order_id=${encodeURIComponent(trimmed)}`;
    try {
      const doFetch = this.fetchImpl ?? fetch;
      const dyn = this.getHeaders ? await this.getHeaders('GET', path) : {};
      const res = await doFetch(`${this.host}${path}`, {
        method: 'GET',
        headers: { ...(this.headers ?? {}), ...dyn },
      });
      const atMs = this.clock();
      if (res.status === ENGINE_RESTARTING_HTTP_STATUS) {
        this.cooldown.noteEngineRestart(atMs);
        return {
          ok: false, orderId: trimmed, scoring: false, status: res.status,
          engineRestarting: true, postOnlyRemainingMs: this.cooldown.remainingMs(atMs),
          error: 'http 425 engine restarting',
        };
      }
      if (!res.ok) {
        return {
          ok: false, orderId: trimmed, scoring: false, status: res.status,
          engineRestarting: false, postOnlyRemainingMs: this.cooldown.remainingMs(atMs),
          error: `http ${res.status}`,
        };
      }
      const parsed = (await res.json()) as { scoring?: unknown };
      if (typeof parsed?.scoring !== 'boolean') {
        return {
          ok: false, orderId: trimmed, scoring: false, status: res.status,
          engineRestarting: false, postOnlyRemainingMs: this.cooldown.remainingMs(atMs),
          error: 'malformed order-scoring payload',
        };
      }
      return {
        ok: true, orderId: trimmed, scoring: parsed.scoring, status: res.status,
        engineRestarting: false, postOnlyRemainingMs: this.cooldown.remainingMs(atMs),
      };
    } catch (err) {
      const atMs = this.clock();
      return {
        ok: false, orderId: trimmed, scoring: false, status: 0,
        engineRestarting: false, postOnlyRemainingMs: this.cooldown.remainingMs(atMs),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async checkOrdersScoringBatch(orderIds: ReadonlyArray<string>): Promise<BatchOrdersScoringResult> {
    const cleanIds = orderIds.map((id) => id.trim()).filter(Boolean);
    const now = this.clock();
    if (cleanIds.length === 0) {
      return { ok: true, scores: {}, status: 200, engineRestarting: false, postOnlyRemainingMs: this.cooldown.remainingMs(now) };
    }
    const path = '/orders-scoring';
    const body = JSON.stringify({ order_ids: cleanIds });
    try {
      const doFetch = this.fetchImpl ?? fetch;
      const dyn = this.getHeaders ? await this.getHeaders('POST', path, body) : {};
      const res = await doFetch(`${this.host}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.headers ?? {}), ...dyn },
        body,
      });
      const atMs = this.clock();
      if (res.status === ENGINE_RESTARTING_HTTP_STATUS) {
        this.cooldown.noteEngineRestart(atMs);
        return {
          ok: false, scores: {}, status: res.status, engineRestarting: true,
          postOnlyRemainingMs: this.cooldown.remainingMs(atMs), error: 'http 425 engine restarting',
        };
      }
      if (!res.ok) {
        return {
          ok: false, scores: {}, status: res.status, engineRestarting: false,
          postOnlyRemainingMs: this.cooldown.remainingMs(atMs), error: `http ${res.status}`,
        };
      }
      const raw = (await res.json()) as Record<string, unknown>;
      const scores: Record<string, boolean> = {};
      for (const id of cleanIds) {
        if (typeof raw?.[id] === 'boolean') scores[id] = raw[id] as boolean;
      }
      return { ok: true, scores, status: res.status, engineRestarting: false, postOnlyRemainingMs: this.cooldown.remainingMs(atMs) };
    } catch (err) {
      const atMs = this.clock();
      return {
        ok: false, scores: {}, status: 0, engineRestarting: false,
        postOnlyRemainingMs: this.cooldown.remainingMs(atMs),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  classifySubmitAndRecordCooldown(httpStatus: number, body: unknown, nowMs = this.clock()): ClobV2SubmitOutcome {
    const outcome = classifyClobV2SubmitResponse(httpStatus, body, nowMs);
    if (outcome.kind === 'engine-restarting') this.cooldown.noteEngineRestart(nowMs);
    return outcome;
  }

  gateOrder(intent: ClobV2OrderIntent, nowMs = this.clock()): ClobV2OrderValidation {
    return gateOrderThroughCooldown(intent, this.cooldown, nowMs);
  }
}
