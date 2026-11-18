import { describe, expect, it } from 'vitest';
import {
  createRiskGatedOrderGateway,
  runSettlementAndHeartbeatFailureDrill,
} from '../../src/desk/polymarket/poly-settlement-reconciliation-drills';
import { cmdDrillGhost } from '../../scripts/poly-sidecars';

describe('Blocker C — Settlement, GhostGuard, Heartbeat & Order Reconciliation Drills', () => {
  it('verifies GhostGuard (<100ms) and Heartbeat deadman drills latch PolyKillSwitch and block new orders', async () => {
    const drill = await runSettlementAndHeartbeatFailureDrill();
    expect(drill).toEqual({
      ghostGuardLatched: true,
      heartbeatDeadmanTriggered: true,
      postKillOrderBlocked: true,
    });

    const sidecarGhostDrill = await cmdDrillGhost();
    expect(sidecarGhostDrill.ok).toBe(true);
    expect(sidecarGhostDrill.killSwitchLatched).toBe(true);
    expect(Number(sidecarGhostDrill.elapsedMs)).toBeLessThan(100);
    expect(sidecarGhostDrill.activeManagedPids).toEqual([]);
  });

  it('enforces risk engine BEFORE every order path (stale book, missing fee, notional cap, drawdown halt)', () => {
    const gw = createRiskGatedOrderGateway(100);
    const baseInput = {
      intentId: 'i-1',
      orderId: 'o-1',
      marketId: 'mkt-fed',
      tokenId: 'tok-yes',
      side: 'BUY' as const,
      requestedSize: 10,
      limitPrice: 0.4,
      timestamp: 1_760_000_000_000,
    };

    // 1. Stale / unknown market data -> blocked BEFORE order creation
    const stale = gw.submitRiskGatedOrder(baseInput, {
      nowMs: 1_760_000_000_000,
      observedAtMs: 'unknown',
      feeRateBps: 0,
      maxNotionalUsd: 20,
      currentDrawdownPct: 0,
    });
    expect(stale.ok).toBe(false);
    expect(gw.reconciler.getOrder('o-1')).toBeUndefined();

    // 2. Missing fee schedule -> blocked
    const noFee = gw.submitRiskGatedOrder(baseInput, {
      nowMs: 1_760_000_000_000,
      observedAtMs: 1_760_000_000_000,
      feeRateBps: null,
      maxNotionalUsd: 20,
      currentDrawdownPct: 0,
    });
    expect(noFee.ok).toBe(false);

    // 3. Single-order notional exceeds $5 pilot limit -> blocked
    const overCap = gw.submitRiskGatedOrder(
      { ...baseInput, requestedSize: 20, limitPrice: 0.5 },
      {
        nowMs: 1_760_000_000_000,
        observedAtMs: 1_760_000_000_000,
        feeRateBps: 0,
        maxNotionalUsd: 5,
        currentDrawdownPct: 0,
      },
    );
    expect(overCap.ok).toBe(false);

    // 4. Drawdown breach -> auto-halts kill switch
    const ddHalt = gw.submitRiskGatedOrder(baseInput, {
      nowMs: 1_760_000_000_000,
      observedAtMs: 1_760_000_000_000,
      feeRateBps: 0,
      maxNotionalUsd: 20,
      currentDrawdownPct: 6.5,
    });
    expect(ddHalt.ok).toBe(false);
    expect(gw.killSwitch.isFired()).toBe(true);
  });

  it('simulates duplicate-order prevention, partial fills, delayed confirmations (UNKNOWN), cancellation, and on-chain reconciliation', () => {
    const gw = createRiskGatedOrderGateway(100);
    const ctx = {
      nowMs: 1_760_000_000_000,
      observedAtMs: 1_760_000_000_000,
      feeRateBps: 0,
      maxNotionalUsd: 20,
      currentDrawdownPct: 0,
    };

    const sub = gw.submitRiskGatedOrder(
      {
        intentId: 'intent-alpha-1',
        orderId: 'ord-alpha-1',
        marketId: 'mkt-macro',
        tokenId: 'tok-macro-yes',
        side: 'BUY',
        requestedSize: 10,
        limitPrice: 0.4,
        timestamp: 1_760_000_000_000,
      },
      ctx,
    );
    expect(sub).toEqual({ ok: true, orderId: 'ord-alpha-1' });

    // Duplicate intentId is rejected idempotently
    expect(() =>
      gw.reconciler.createOrder({
        intentId: 'intent-alpha-1',
        orderId: 'ord-alpha-dup',
        marketId: 'mkt-macro',
        tokenId: 'tok-macro-yes',
        side: 'BUY',
        requestedSize: 10,
        limitPrice: 0.4,
        timestamp: 1_760_000_000_100,
      }),
    ).toThrow(/Duplicate order intent/);

    // Partial fill #1 (4 shares @ $0.40, fee $0.01) + duplicate event replay ignored
    gw.reconciler.applyEvent({
      eventId: 'ev-fill-1',
      orderId: 'ord-alpha-1',
      type: 'PARTIALLY_FILLED',
      fillSize: 4,
      fillPrice: 0.4,
      feeUsdc: 0.01,
      timestamp: 1_760_000_001_000,
    });
    gw.reconciler.applyEvent({
      eventId: 'ev-fill-1',
      orderId: 'ord-alpha-1',
      type: 'PARTIALLY_FILLED',
      fillSize: 4,
      fillPrice: 0.4,
      feeUsdc: 0.01,
      timestamp: 1_760_000_001_000,
    });
    expect(gw.reconciler.getOrder('ord-alpha-1')?.status).toBe('PARTIALLY_FILLED');
    expect(gw.reconciler.getOrder('ord-alpha-1')?.filledSize).toBe(4);

    // Remainder cancelled cleanly
    gw.reconciler.applyEvent({
      eventId: 'ev-cancel-rem',
      orderId: 'ord-alpha-1',
      type: 'CANCELLED',
      timestamp: 1_760_000_002_000,
    });
    expect(gw.reconciler.getOrder('ord-alpha-1')?.status).toBe('CANCELLED');
    expect(gw.reconciler.reconcile().unexplainedDriftUsdc).toBe(0);

    // Delayed confirmation (TIMEOUT_UNKNOWN) freezes both new orders and market redemption
    const sub2 = gw.submitRiskGatedOrder(
      {
        intentId: 'intent-alpha-2',
        orderId: 'ord-alpha-2',
        marketId: 'mkt-macro',
        tokenId: 'tok-macro-yes',
        side: 'BUY',
        requestedSize: 5,
        limitPrice: 0.4,
        timestamp: 1_760_000_003_000,
      },
      ctx,
    );
    expect(sub2.ok).toBe(true);
    gw.reconciler.applyEvent({
      eventId: 'ev-timeout-2',
      orderId: 'ord-alpha-2',
      type: 'TIMEOUT_UNKNOWN',
      timestamp: 1_760_000_008_000,
    });

    const blockedWhileUnknown = gw.submitRiskGatedOrder(
      {
        intentId: 'intent-alpha-3',
        orderId: 'ord-alpha-3',
        marketId: 'mkt-macro',
        tokenId: 'tok-macro-yes',
        side: 'BUY',
        requestedSize: 5,
        limitPrice: 0.4,
        timestamp: 1_760_000_009_000,
      },
      ctx,
    );
    expect(blockedWhileUnknown.ok).toBe(false);
    expect(() =>
      gw.reconciler.settleMarketRedemption({
        marketId: 'mkt-macro',
        tokenId: 'tok-macro-yes',
        payoutPerShareUsdc: 1,
      }),
    ).toThrow(/unresolved UNKNOWN order/);

    // Late confirmation arrives -> resolves UNKNOWN -> on-chain balance matches -> settles cleanly
    gw.reconciler.applyEvent({
      eventId: 'ev-late-fill-2',
      orderId: 'ord-alpha-2',
      type: 'FILLED',
      fillSize: 5,
      fillPrice: 0.4,
      feeUsdc: 0,
      timestamp: 1_760_000_010_000,
    });

    const cleanChain = gw.reconcileWithOnChainBalances({ 'tok-macro-yes': 9 });
    expect(cleanChain.reconciled).toBe(true);
    expect(gw.killSwitch.isFired()).toBe(false);

    const settlement = gw.reconciler.settleMarketRedemption({
      marketId: 'mkt-macro',
      tokenId: 'tok-macro-yes',
      payoutPerShareUsdc: 1,
    });
    expect(settlement.settledShares).toBe(9);
    expect(settlement.payoutUsdc).toBe(9);
    expect(gw.reconciler.reconcile().unexplainedDriftUsdc).toBe(0);

    // On-chain mismatch immediately latches kill switch
    const mismatchChain = gw.reconcileWithOnChainBalances({ 'tok-macro-yes': 2 });
    expect(mismatchChain.reconciled).toBe(false);
    expect(gw.killSwitch.isFired()).toBe(true);
  });
});
