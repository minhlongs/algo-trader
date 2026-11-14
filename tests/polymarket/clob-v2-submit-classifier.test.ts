/**
 * Pins the CLOB V2 order gate and the `POST /order` classification.
 *
 * Two behaviours a V1-shaped client gets wrong: the submit is asynchronous (an
 * accepted order is live, not filled), and a matching-engine restart answers
 * HTTP 425 followed by a two-minute post-only-only window.
 */

import { describe, it, expect } from 'vitest';
import {
  EngineRestartCooldown,
  ENGINE_RESTART_POST_ONLY_MS,
  classifyClobV2SubmitResponse,
  expirationFromNowMs,
  gateOrderThroughCooldown,
  validateClobV2Order,
  type ClobV2OrderIntent,
} from '../../src/desk/polymarket/clob-v2-order-surface';

const BASE_ORDER: ClobV2OrderIntent = {
  tokenId: '12345678901234567890',
  side: 'BUY',
  price: 0.5,
  size: 10,
  orderType: 'GTC',
  tickSize: 0.01,
};

describe('validateClobV2Order', () => {
  it('accepts a well-formed order', () => {
    expect(validateClobV2Order(BASE_ORDER)).toEqual({ ok: true, order: BASE_ORDER });
  });

  it('rejects any non-zero builder code', () => {
    const result = validateClobV2Order({ ...BASE_ORDER, builderCode: `0x${'ab'.repeat(32)}` });
    expect(result).toMatchObject({ ok: false, code: 'builder-code-forbidden' });
  });

  it('enforces the 5-share minimum on resting order types only', () => {
    const small: ClobV2OrderIntent = { ...BASE_ORDER, size: 4.99 };
    expect(validateClobV2Order(small)).toMatchObject({ ok: false, code: 'size-below-minimum' });
    expect(validateClobV2Order({ ...small, orderType: 'FOK' }).ok).toBe(true);
    expect(validateClobV2Order({ ...BASE_ORDER, size: 5 }).ok).toBe(true);
  });

  it('rejects a price that is not a multiple of the market tick', () => {
    const result = validateClobV2Order({ ...BASE_ORDER, price: 0.505, tickSize: 0.01 });
    expect(result).toMatchObject({ ok: false, code: 'price-off-tick' });
  });

  it('accepts a sub-cent tick when the price honours it', () => {
    expect(validateClobV2Order({ ...BASE_ORDER, price: 0.001, tickSize: 0.001 }).ok).toBe(true);
  });

  it('rejects the closed interval endpoints', () => {
    expect(validateClobV2Order({ ...BASE_ORDER, price: 1 })).toMatchObject({
      code: 'price-out-of-range',
    });
    expect(validateClobV2Order({ ...BASE_ORDER, price: 0 })).toMatchObject({
      code: 'price-out-of-range',
    });
  });

  it('requires a GTD expiration', () => {
    expect(validateClobV2Order({ ...BASE_ORDER, orderType: 'GTD' })).toMatchObject({
      code: 'gtd-requires-expiration',
    });
    expect(
      validateClobV2Order({ ...BASE_ORDER, orderType: 'GTD', expiration: 1_900_000_000 }).ok,
    ).toBe(true);
  });
});

describe('engine restart cooldown', () => {
  it('requires post-only for exactly two minutes after a 425', () => {
    const cooldown = new EngineRestartCooldown();
    expect(cooldown.requiresPostOnly(1_000)).toBe(false);
    cooldown.noteEngineRestart(1_000);
    expect(cooldown.requiresPostOnly(1_001)).toBe(true);
    expect(cooldown.remainingMs(1_000)).toBe(ENGINE_RESTART_POST_ONLY_MS);
    expect(cooldown.requiresPostOnly(1_000 + ENGINE_RESTART_POST_ONLY_MS)).toBe(false);
  });

  it('extends, never shortens, on overlapping restarts', () => {
    const cooldown = new EngineRestartCooldown();
    cooldown.noteEngineRestart(0);
    cooldown.noteEngineRestart(60_000);
    expect(cooldown.remainingMs(60_000)).toBe(ENGINE_RESTART_POST_ONLY_MS);
  });

  it('blocks a crossing order but lets a post-only order through', () => {
    const cooldown = new EngineRestartCooldown();
    cooldown.noteEngineRestart(0);
    expect(gateOrderThroughCooldown(BASE_ORDER, cooldown, 1_000)).toMatchObject({
      ok: false,
      code: 'post-only-required-while-engine-restarting',
    });
    expect(gateOrderThroughCooldown({ ...BASE_ORDER, postOnly: true }, cooldown, 1_000).ok).toBe(
      true,
    );
    expect(gateOrderThroughCooldown(BASE_ORDER, cooldown, 200_000).ok).toBe(true);
  });

  it('clears the window on demand', () => {
    const cooldown = new EngineRestartCooldown();
    cooldown.noteEngineRestart(0);
    cooldown.clear();
    expect(cooldown.requiresPostOnly(1)).toBe(false);
  });
});

describe('classifyClobV2SubmitResponse', () => {
  const NOW = 1_700_000_000_000;

  it('maps 425 to the restarting outcome with the post-only deadline', () => {
    expect(classifyClobV2SubmitResponse(425, {}, NOW)).toEqual({
      kind: 'engine-restarting',
      retryAfterMs: ENGINE_RESTART_POST_ONLY_MS,
      postOnlyUntilMs: NOW + ENGINE_RESTART_POST_ONLY_MS,
    });
  });

  it('treats an accepted order as live rather than filled', () => {
    const outcome = classifyClobV2SubmitResponse(200, { orderID: 'ord-1' }, NOW);
    expect(outcome).toEqual({ kind: 'accepted', orderId: 'ord-1', status: 'live', tradeIds: [] });
  });

  it('keeps the delayed state the async pipeline reports', () => {
    const outcome = classifyClobV2SubmitResponse(200, { orderID: 'o', status: 'delayed' }, NOW);
    expect(outcome).toMatchObject({ kind: 'accepted', status: 'delayed' });
  });

  it('carries the settlement trade ids when the venue returns them', () => {
    const outcome = classifyClobV2SubmitResponse(
      200,
      { orderID: 'o', status: 'matched', tradeIDs: ['t1', 42, 't2'] },
      NOW,
    );
    expect(outcome).toMatchObject({ status: 'matched', tradeIds: ['t1', 't2'] });
  });

  it('rejects a 200 that carries no order id', () => {
    expect(classifyClobV2SubmitResponse(200, {}, NOW)).toMatchObject({
      kind: 'rejected',
      reason: expect.stringContaining('missing orderID'),
    });
  });

  it('surfaces the venue error text on a 4xx', () => {
    expect(classifyClobV2SubmitResponse(400, { error: 'insufficient balance' }, NOW)).toEqual({
      kind: 'rejected',
      reason: 'insufficient balance',
    });
  });

  it('backs off on a 429 instead of rejecting', () => {
    expect(classifyClobV2SubmitResponse(429, {}, NOW)).toMatchObject({ kind: 'rate-limited' });
  });
});

describe('expirationFromNowMs', () => {
  it('converts a ttl to unix seconds', () => {
    expect(expirationFromNowMs(1_700_000_000_000, 60_000)).toBe(1_700_000_060);
  });
});
