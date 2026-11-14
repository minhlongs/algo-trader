/**
 * Polymarket CLOB V2 — pre-signing order gate.
 *
 * Every rule here rejects an order locally that the venue would reject anyway,
 * or one it would happily accept while charging us more: a non-zero builder code,
 * a resting size under the 5-share minimum, a price off the market's tick, or a
 * crossing order during the two-minute post-only window that follows a matching
 * engine restart.
 */

import {
  MIN_RESTING_ORDER_SHARES,
  ZERO_BUILDER_CODE,
  type ClobV2OrderIntent,
  type ClobV2OrderValidation,
} from './clob-v2-venue-constants';

const PRICE_EPSILON = 1e-9;
const TICK_TOLERANCE = 1e-6;

function isOnTick(price: number, tickSize: number): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(tickSize) || !(tickSize > 0)) return false;
  const ticks = price / tickSize;
  return Number.isFinite(ticks) && Math.abs(ticks - Math.round(ticks)) < TICK_TOLERANCE;
}

/**
 * Gate an order before it is signed. `postOnlyRequired` comes from the engine
 * restart cooldown, so a crossing order is refused locally rather than by the venue.
 */
export function validateClobV2Order(
  intent: ClobV2OrderIntent,
  postOnlyRequired = false,
): ClobV2OrderValidation {
  const builder = (intent.builderCode ?? ZERO_BUILDER_CODE).toLowerCase();
  if (builder !== ZERO_BUILDER_CODE) {
    return {
      ok: false,
      code: 'builder-code-forbidden',
      detail: 'a builder code adds up to 100 bps; it must stay zero',
    };
  }
  const rests = intent.orderType === 'GTC' || intent.orderType === 'GTD';
  if (!Number.isFinite(intent.size) || intent.size <= 0) {
    return {
      ok: false,
      code: 'size-below-minimum',
      detail: `size must be positive and finite, got ${intent.size}`,
    };
  }
  if (rests && intent.size + PRICE_EPSILON < MIN_RESTING_ORDER_SHARES) {
    return {
      ok: false,
      code: 'size-below-minimum',
      detail: `${intent.orderType} needs ${MIN_RESTING_ORDER_SHARES} shares, got ${intent.size}`,
    };
  }
  if (!Number.isFinite(intent.price) || !(intent.price > PRICE_EPSILON) || intent.price >= 1 - PRICE_EPSILON) {
    return { ok: false, code: 'price-out-of-range', detail: `price ${intent.price} outside (0,1)` };
  }
  if (!isOnTick(intent.price, intent.tickSize)) {
    return {
      ok: false,
      code: 'price-off-tick',
      detail: `price ${intent.price} is not a multiple of tick ${intent.tickSize}`,
    };
  }
  if (intent.orderType === 'GTD' && (!Number.isFinite(intent.expiration) || (intent.expiration ?? 0) <= 0)) {
    return { ok: false, code: 'gtd-requires-expiration', detail: 'GTD needs a finite positive expiration' };
  }
  if (postOnlyRequired && !intent.postOnly) {
    return {
      ok: false,
      code: 'post-only-required-while-engine-restarting',
      detail: 'matching engine restarting: post-only only for the next 2 minutes',
    };
  }
  return { ok: true, order: intent };
}
