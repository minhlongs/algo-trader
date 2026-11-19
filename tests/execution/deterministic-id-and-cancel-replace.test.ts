import { describe, expect, it } from 'vitest';
import {
  ClientOrderIdRegistry,
  deriveDeterministicClientOrderId,
  deriveDeterministicOrderSalt,
  type DeterministicOrderIdInput,
} from '../../src/desk/execution/deterministic-client-order-id';
import { PolymarketCancelReplaceManager } from '../../src/desk/execution/polymarket-cancel-replace';
import { EngineRestartCooldown } from '../../src/desk/polymarket/clob-v2-submit-classifier';

const BASE_INPUT: DeterministicOrderIdInput = {
  strategyId: 'poly-mm-v2',
  marketId: 'mkt-btc-100k',
  tokenId: 'tok-yes-1',
  side: 'BUY',
  priceMicro: 520_000,
  sizeMicro: 25_000_000,
  intentEpochMs: 1_763_500_000_000,
  sequence: 1,
};

describe('deterministic-client-order-id', () => {
  it('derives stable poly_<32hex> id and decimal EIP-712 salt across calls', () => {
    const id1 = deriveDeterministicClientOrderId(BASE_INPUT);
    const id2 = deriveDeterministicClientOrderId({ ...BASE_INPUT });
    const salt1 = deriveDeterministicOrderSalt(BASE_INPUT);
    const salt2 = deriveDeterministicOrderSalt({ ...BASE_INPUT });

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^poly_[0-9a-f]{32}$/);
    expect(salt1).toBe(salt2);
    expect(salt1).toMatch(/^\d+$/);
    expect(BigInt(salt1)).toBeGreaterThan(0n);
  });

  it('changes id and salt when any canonical field changes', () => {
    const baseId = deriveDeterministicClientOrderId(BASE_INPUT);
    const nextSeqId = deriveDeterministicClientOrderId({ ...BASE_INPUT, sequence: 2 });
    const nextPriceId = deriveDeterministicClientOrderId({ ...BASE_INPUT, priceMicro: 530_000 });
    const sellId = deriveDeterministicClientOrderId({ ...BASE_INPUT, side: 'SELL' });

    expect(new Set([baseId, nextSeqId, nextPriceId, sellId]).size).toBe(4);
  });

  it('rejects invalid empty or negative inputs', () => {
    expect(() => deriveDeterministicClientOrderId({ ...BASE_INPUT, strategyId: '  ' })).toThrow();
    expect(() => deriveDeterministicClientOrderId({ ...BASE_INPUT, priceMicro: -1 })).toThrow();
    expect(() => deriveDeterministicClientOrderId({ ...BASE_INPUT, sizeMicro: 1.5 })).toThrow();
  });

  it('deduplicates retries and survives serialize/hydrate across restarts', () => {
    const reg = new ClientOrderIdRegistry();
    const first = reg.register(BASE_INPUT, 1000);
    const retry = reg.register(BASE_INPUT, 1500);

    expect(first.isDuplicate).toBe(false);
    expect(first.attempts).toBe(1);
    expect(retry.isDuplicate).toBe(true);
    expect(retry.attempts).toBe(2);
    expect(retry.clientOrderId).toBe(first.clientOrderId);

    const snapshot = reg.serialize();
    const restored = new ClientOrderIdRegistry();
    restored.hydrate(snapshot);

    expect(restored.size()).toBe(1);
    expect(restored.has(first.clientOrderId)).toBe(true);
    const afterRestartRetry = restored.register(BASE_INPUT, 2000);
    expect(afterRestartRetry.isDuplicate).toBe(true);
    expect(afterRestartRetry.attempts).toBe(3);

    const tampered = {
      entries: [{ ...snapshot.entries[0]!, clientOrderId: 'poly_00000000000000000000000000000000' }],
    };
    expect(() => restored.hydrate(tampered)).toThrow(/Corrupted ClientOrderIdRegistry/);
  });
});

describe('PolymarketCancelReplaceManager', () => {
  const NEXT_INPUT: DeterministicOrderIdInput = {
    ...BASE_INPUT,
    priceMicro: 530_000,
    sequence: 2,
  };

  it('enforces single in-flight cancel/replace and atomically switches clientOrderId after cancel ack', () => {
    const mgr = new PolymarketCancelReplaceManager();
    const live = mgr.registerLiveOrder('slot-bid', BASE_INPUT, 'ex-ord-1', 1000);
    expect(live.state).toBe('LIVE');

    const req = mgr.requestReplace('slot-bid', NEXT_INPUT, 1100);
    expect(req.accepted).toBe(true);
    expect(req.record.state).toBe('PENDING_CANCEL');
    // Active clientOrderId MUST NOT switch before cancel ack
    expect(req.record.activeClientOrderId).toBe(deriveDeterministicClientOrderId(BASE_INPUT));

    // Concurrent cancel or replace while PENDING_CANCEL must be blocked (no double-exposure)
    const blockedReplace = mgr.requestReplace('slot-bid', { ...NEXT_INPUT, sequence: 3 }, 1150);
    expect(blockedReplace.accepted).toBe(false);
    expect(blockedReplace.reason).toBe('IN_FLIGHT_CANCEL_OR_REPLACE');

    const blockedCancel = mgr.requestCancel('slot-bid', 1160);
    expect(blockedCancel.accepted).toBe(false);
    expect(blockedCancel.reason).toBe('IN_FLIGHT_CANCEL_OR_REPLACE');

    // Cancel ack atomically promotes the new deterministic clientOrderId
    const cancelAck = mgr.onCancelAck('slot-bid', 1200);
    expect(cancelAck.accepted).toBe(true);
    expect(cancelAck.record.state).toBe('PENDING_REPLACE');
    expect(cancelAck.record.activeClientOrderId).toBe(deriveDeterministicClientOrderId(NEXT_INPUT));

    // Replace ack finalizes to REPLACED
    const replaceAck = mgr.onReplaceAck('slot-bid', 'ex-ord-2', 1250);
    expect(replaceAck.accepted).toBe(true);
    expect(replaceAck.record.state).toBe('REPLACED');
    expect(replaceAck.record.activeExchangeOrderId).toBe('ex-ord-2');
  });

  it('promotes pending replace atomically after confirmed terminal fill during cancel flight', () => {
    const mgr = new PolymarketCancelReplaceManager();
    mgr.registerLiveOrder('slot-ask', BASE_INPUT, 'ex-ord-10', 2000);
    mgr.requestReplace('slot-ask', NEXT_INPUT, 2100);

    const fillRes = mgr.onTerminalFill('slot-ask', 2120);
    expect(fillRes.accepted).toBe(true);
    expect(fillRes.record.state).toBe('PENDING_REPLACE');
    expect(fillRes.record.activeClientOrderId).toBe(deriveDeterministicClientOrderId(NEXT_INPUT));
  });

  it('defers replace during HTTP 425 EngineRestartCooldown and resumes after cooldown expires', () => {
    const cooldown = new EngineRestartCooldown(120_000);
    const mgr = new PolymarketCancelReplaceManager(cooldown);
    mgr.registerLiveOrder('slot-425', BASE_INPUT, 'ex-ord-425', 10_000);

    const note = mgr.noteHttp425('slot-425', 10_500);
    expect(note.accepted).toBe(false);
    expect(note.reason).toBe('ENGINE_RESTART_COOLDOWN_DEFERRED');
    expect(note.deferredUntilMs).toBe(130_500);

    // Replace requested during cooldown is deferred (state remains LIVE, no premature cancel)
    const deferred = mgr.requestReplace('slot-425', NEXT_INPUT, 20_000);
    expect(deferred.accepted).toBe(false);
    expect(deferred.reason).toBe('ENGINE_RESTART_COOLDOWN_DEFERRED');
    expect(deferred.record.state).toBe('LIVE');

    // Still deferred before cooldown expires
    const tooEarly = mgr.retryDeferredReplace('slot-425', 130_499);
    expect(tooEarly.accepted).toBe(false);
    expect(tooEarly.reason).toBe('ENGINE_RESTART_COOLDOWN_DEFERRED');

    // Resumes cleanly once cooldown expires
    const resumed = mgr.retryDeferredReplace('slot-425', 130_500);
    expect(resumed.accepted).toBe(true);
    expect(resumed.record.state).toBe('PENDING_CANCEL');
  });

  it('blocks double-exposure on REPLACED slot, clears deferred replace on cancel, and rejects duplicate retry', () => {
    const cooldown = new EngineRestartCooldown(120_000);
    const mgr = new PolymarketCancelReplaceManager(cooldown);
    mgr.registerLiveOrder('slot-safe', BASE_INPUT, 'ex-1', 1000);
    mgr.requestReplace('slot-safe', NEXT_INPUT, 1010);
    mgr.onCancelAck('slot-safe', 1020);
    // Duplicate retryDeferredReplace while PENDING_REPLACE is already in flight must be rejected
    expect(mgr.retryDeferredReplace('slot-safe', 1025).accepted).toBe(false);
    mgr.onReplaceAck('slot-safe', 'ex-2', 1030);
    // Registering a new live order over a REPLACED active slot must throw
    expect(() => mgr.registerLiveOrder('slot-safe', BASE_INPUT, 'ex-3', 1040)).toThrow(/REPLACED/);

    // Deferred replace followed by explicit requestCancel must transition to CANCELLED, not resurrect replace
    mgr.noteHttp425('slot-safe', 2000);
    expect(mgr.requestReplace('slot-safe', BASE_INPUT, 2010).reason).toBe('ENGINE_RESTART_COOLDOWN_DEFERRED');
    expect(mgr.requestCancel('slot-safe', 2020).accepted).toBe(true);
    const ack = mgr.onCancelAck('slot-safe', 2030);
    expect(ack.record.state).toBe('CANCELLED');
  });

  it('supports pure cancel -> CANCELLED and explicit failure -> FAILED transitions', () => {
    const mgr = new PolymarketCancelReplaceManager();
    mgr.registerLiveOrder('slot-c', BASE_INPUT, 'ex-c', 100);
    expect(mgr.requestCancel('slot-c', 110).record.state).toBe('PENDING_CANCEL');
    expect(mgr.onCancelAck('slot-c', 120).record.state).toBe('CANCELLED');

    mgr.registerLiveOrder('slot-f', BASE_INPUT, 'ex-f', 200);
    const failed = mgr.onFailure('slot-f', 'VENUE_REJECTED', 210);
    expect(failed.accepted).toBe(false);
    expect(failed.record.state).toBe('FAILED');
    expect(failed.record.failureReason).toBe('VENUE_REJECTED');
  });
});
