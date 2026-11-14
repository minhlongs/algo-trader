/**
 * Polymarket CLOB V2 — `POST /order` response classification and restart cooldown.
 *
 * Two V2 behaviours a V1-shaped client gets wrong:
 *
 *   1. `POST /order` is asynchronous. The HTTP response carries an order id and a
 *      status, never an on-chain transaction hash — settlement is reported later
 *      by the trade feed. An "accepted" order is therefore live, not filled.
 *   2. When the matching engine restarts it answers HTTP 425 and then accepts
 *      post-only orders only for the next two minutes. Treating 425 as a generic
 *      error means either retrying into a wall or dropping fills that were legal.
 */

import {
  ENGINE_RESTART_POST_ONLY_MS,
  ENGINE_RESTARTING_HTTP_STATUS,
  type ClobV2OrderIntent,
} from './clob-v2-venue-constants';
import { validateClobV2Order } from './clob-v2-order-validation';

const SECONDS_PER_MS = 1_000;
const RATE_LIMIT_RETRY_MS = 1_000;

export type ClobV2SubmitOutcome =
  | {
      kind: 'accepted';
      orderId: string;
      status: 'live' | 'matched' | 'delayed';
      tradeIds: string[];
    }
  | { kind: 'engine-restarting'; retryAfterMs: number; postOnlyUntilMs: number }
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'rejected'; reason: string };

interface ClobV2SubmitPayload {
  orderID?: unknown;
  status?: unknown;
  error?: unknown;
  tradeIDs?: unknown;
}

function readAcceptedStatus(raw: unknown): 'live' | 'matched' | 'delayed' {
  return raw === 'matched' || raw === 'delayed' ? raw : 'live';
}

function readTradeIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
}

export function classifyClobV2SubmitResponse(
  httpStatus: number,
  body: unknown,
  nowMs: number,
): ClobV2SubmitOutcome {
  const payload = (body ?? {}) as ClobV2SubmitPayload;
  const reason = typeof payload.error === 'string' ? payload.error : `http ${httpStatus}`;

  if (httpStatus === ENGINE_RESTARTING_HTTP_STATUS) {
    return {
      kind: 'engine-restarting',
      retryAfterMs: ENGINE_RESTART_POST_ONLY_MS,
      postOnlyUntilMs: nowMs + ENGINE_RESTART_POST_ONLY_MS,
    };
  }
  if (httpStatus === 429) return { kind: 'rate-limited', retryAfterMs: RATE_LIMIT_RETRY_MS };
  if (httpStatus >= 400) return { kind: 'rejected', reason };
  if (typeof payload.orderID !== 'string' || !payload.orderID) {
    return { kind: 'rejected', reason: 'missing orderID in the V2 async response' };
  }
  return {
    kind: 'accepted',
    orderId: payload.orderID,
    status: readAcceptedStatus(payload.status),
    tradeIds: readTradeIds(payload.tradeIDs),
  };
}

/** Tracks the two-minute post-only window that follows an engine restart. */
export class EngineRestartCooldown {
  private postOnlyUntilMs = 0;

  constructor(private readonly windowMs: number = ENGINE_RESTART_POST_ONLY_MS) {}

  /** Feed every 425 through here; overlapping windows extend rather than shorten. */
  noteEngineRestart(nowMs: number): void {
    this.postOnlyUntilMs = Math.max(this.postOnlyUntilMs, nowMs + this.windowMs);
  }

  requiresPostOnly(nowMs: number): boolean {
    return nowMs < this.postOnlyUntilMs;
  }

  remainingMs(nowMs: number): number {
    return Math.max(0, this.postOnlyUntilMs - nowMs);
  }

  clear(): void {
    this.postOnlyUntilMs = 0;
  }
}

/** Validate an intent against the cooldown and return the refusal, if any. */
export function gateOrderThroughCooldown(
  intent: ClobV2OrderIntent,
  cooldown: EngineRestartCooldown,
  nowMs: number,
) {
  return validateClobV2Order(intent, cooldown.requiresPostOnly(nowMs));
}

/** Unix seconds — the unit a GTD expiration is expressed in. */
export function expirationFromNowMs(nowMs: number, ttlMs: number): number {
  return Math.floor((nowMs + ttlMs) / SECONDS_PER_MS);
}
