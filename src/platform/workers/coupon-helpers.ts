/**
 * CashClaw coupon handler — CF-native, zero VPS.
 * Coupons stored in KV (`coupon:CODE` keys).
 * Matches landing page forest/js/services/coupon-service.js contract.
 * Uses SDK-style validation + structured errors from nowpayments-utils.
 *
 * Barrel facade over the split coupon modules. Coupon handlers and tests import
 * from here so the internal module boundary stays free to move.
 */

export { isNonEmptyString, validationError, configError, apiError } from './nowpayments-utils';
export type { KVNamespace } from '@cloudflare/workers-types';

export type {
  ActivateBody,
  Coupon,
  Env,
  ValidateResponse,
} from './coupon-model';
export {
  CANCEL_URL,
  CODE_RE,
  CORS_HEADERS,
  INVOICE_IDS,
  json,
  methodNotAllowed,
  optionsResponse,
  sanitizeCode,
  SUCCESS_URL,
  TIER_PRICES,
} from './coupon-model';

export type { LockOperation, LockResult } from './coupon-kv-store';
export { loadCoupon, withCouponLock, withRedeemLock } from './coupon-kv-store';

export { validateCoupon } from './coupon-lifecycle-rules';

export { createInvoice } from './coupon-invoice-client';
