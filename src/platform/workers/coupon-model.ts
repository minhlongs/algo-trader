/**
 * Coupon Model & HTTP Helpers
 *
 * Shared coupon domain types plus the JSON/CORS response helpers used by every
 * coupon handler. Extracted from the coupon-helpers barrel so the barrel stays
 * a re-export facade while the concrete contract lives here.
 */

import type { KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  CACHE: KVNamespace;
  NOWPAYMENTS_API_KEY?: string | null;
}

export interface Coupon {
  code: string;
  discountPercent: number;
  maxUses: number;
  currentUses: number;
  validUntil: string | null;
  applicableTiers: string[];
  createdAt: string;
  active: boolean;
}

export interface ValidateResponse {
  valid: boolean;
  discountPercent?: number;
  urls?: Record<string, string>;
  freeAccess?: boolean;
  reason?: string;
}

export interface ActivateBody {
  email?: string;
  tier?: string;
  couponCode?: string;
  project?: string;
}

/** CashClaw landing-page origin allowed for coupon endpoints. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

/** Coupon codes: uppercase alphanumerics, dashes and underscores, max 32 chars. */
export const CODE_RE = /^[A-Z0-9_-]{1,32}$/;

/** Tier price table (USD) shared by validate/redeem/apply handlers. */
export const TIER_PRICES: Record<string, number> = { STARTER: 49, PRO: 149, ELITE: 499 };

/** NOWPayments invoice id per tier. */
export const INVOICE_IDS: Record<string, string> = {
  STARTER: '4725459350',
  PRO: '5493882802',
  ELITE: '5264305822',
};

export const SUCCESS_URL = 'https://cashclaw.cc/dashboard.html';
export const CANCEL_URL = 'https://cashclaw.cc/#pricing';

/** JSON response with the shared coupon CORS headers. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

/** CORS preflight response for coupon endpoints. */
export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** 405 response for methods a coupon endpoint does not implement. */
export function methodNotAllowed(): Response {
  return json({ error: 'Method Not Allowed' }, 405);
}

/** Uppercase + trim a user-supplied coupon code. */
export function sanitizeCode(input: string): string {
  return input.toUpperCase().trim();
}
