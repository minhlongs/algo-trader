/**
 * End-to-End Wiring Tests for POLY-ALPHA-HUNTER-V4 Core Primitives:
 *   1. `PolymarketV2PreTradeRiskGate` in `SynchronizedRiskGate`, `TriModeDispatcher`/`OrderDispatcher`, and `LiveOrderManager`
 *   2. `IntegerMicroUnitFifoLedger` in `PolymarketOrderReconciler` (fills, serialize/hydrate, zero drift)
 *   3. `OnchainOfiVpinEstimator` & `LogOddsAvellanedaStoikovMarketMaker` in `MarketMakerStrategy`
 */

import { describe, expect, it, vi } from 'vitest';
import { PolymarketV2PreTradeRiskGate } from '../execution/polymarket-v2-pretrade-risk-gate';
import { SynchronizedRiskGate } from '../orchestrator/synchronized-risk-gate';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import { TriModeDispatcher } from '../execution/tri-mode-dispatcher';
import { OrderDispatcher } from '../execution/order-dispatcher';
import { LiveOrderManager } from '../execution/live-order-manager';
import { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import { MarketMakerStrategy } from '../strategies/polymarket/market-maker';
import { MICRO_PER_PUSD } from '../execution/integer-micro-unit-fifo-ledger';
import type { ClobClient, RawOrderBook } from '../polymarket/clob-client';
import type { PolymarketAdapter } from '../execution/polymarket-adapter';
import type { LivePositionTracker } from '../execution/live-position-tracker';

function makeValidPolyIntent(overrides: Partial<UnifiedTradeIntent> = {}): UnifiedTradeIntent {
  return {
    intentId: 'intent-poly-v4-1',
    engineId: 'arbitrage',
    symbol: '0xcond-btc',
    venue: 'polymarket_clob',
    side: 'BUY',
    quantity: 10,
    price: 0.50,
    urgency: 'MEDIUM',
    expectedEdgeBps: 50,
    expectedSharpe: 1.5,
    timeToExpiryMs: 60_000,
    expiresAt: Date.now() + 60_000,
    orderType: 'LIMIT',
    isRiskReducing: false,
    metadata: {
      tickSizeMicro: 10_000,
      isLimitOrder: true,
      rawFreeBalanceMicro: 100 * MICRO_PER_PUSD,
      currentMarketExposureMicro: 0,
      currentVpin: 0.25,
      clusterCvar99Pct: 0.01,
      consecutiveBookErrors: 0,
    },
    ...overrides,
  };
}

describe('Seam 1: PolymarketV2PreTradeRiskGate wired across Risk & Execution paths', () => {
  it('blocks toxic VPIN and sub-5-share limit orders in SynchronizedRiskGate', () => {
    const v2Gate = new PolymarketV2PreTradeRiskGate();
    const syncGate = new SynchronizedRiskGate({ totalNavUsd: 100_000, polymarketV2Gate: v2Gate });

    const validDecision = syncGate.validateOrder(makeValidPolyIntent());
    expect(validDecision.approved).toBe(true);

    const smallDecision = syncGate.validateOrder(
      makeValidPolyIntent({ intentId: 'intent-small', quantity: 3 }),
    );
    expect(smallDecision.approved).toBe(false);
    expect(smallDecision.reason).toContain('BELOW_MIN_LIMIT_SHARES');

    const toxicDecision = syncGate.validateOrder(
      makeValidPolyIntent({ intentId: 'intent-toxic', metadata: { currentVpin: 0.85 } }),
    );
    expect(toxicDecision.approved).toBe(false);
    expect(toxicDecision.reason).toContain('VPIN_TOXICITY_EXCEEDED');
  });

  it('blocks invalid tick grid alignment in TriModeDispatcher and OrderDispatcher', () => {
    const v2Gate = new PolymarketV2PreTradeRiskGate();
    const triDispatcher = new TriModeDispatcher('PAPER', undefined, v2Gate);
    const badTickIntent = makeValidPolyIntent({
      intentId: 'intent-bad-tick',
      price: 0.503,
      metadata: { tickSizeMicro: 10_000, isLimitOrder: true },
    });
    const receipt = triDispatcher.dispatch(badTickIntent);
    expect(receipt.status).toBe('REJECTED');
    expect(receipt.error).toContain('PRICE_NOT_ALIGNED_TO_TICK');

    const orderDispatcher = new OrderDispatcher({ initialMode: 'PAPER', polymarketV2Gate: v2Gate });
    const odReceipt = orderDispatcher.dispatchOrder(badTickIntent);
    expect(odReceipt.status).toBe('REJECTED');
    expect(odReceipt.error).toContain('PRICE_NOT_ALIGNED_TO_TICK');
  });

  it('rejects out-of-bounds price in LiveOrderManager.submitSignal', async () => {
    const v2Gate = new PolymarketV2PreTradeRiskGate();
    const mockAdapter = {
      submitOrder: vi.fn().mockResolvedValue({ orderID: 'ord-1', status: 'LIVE' }),
      getOrderStatus: vi.fn().mockResolvedValue({ status: 'LIVE', sizeMatched: '0' }),
      cancelOrder: vi.fn(),
    } as unknown as PolymarketAdapter;
    const mockTracker = { recordFill: vi.fn() } as unknown as LivePositionTracker;

    const manager = new LiveOrderManager(mockAdapter, mockTracker, 60_000, undefined, v2Gate);
    await expect(
      manager.submitSignal(
        {
          tokenId: '0xtoken1234567890', marketId: '0xmkt1', side: 'BUY',
          price: 0.995, size: 10, strategy: 'mm', reason: 'test', timestamp: Date.now(),
        },
        'mm',
      ),
    ).rejects.toThrow(/RISK_GATE_REJECTED: PRICE_OUTSIDE_EXTREME_CUTOFFS/);
    await manager.stop();
  });
});

describe('Seam 2: IntegerMicroUnitFifoLedger wired into PolymarketOrderReconciler', () => {
  it('tracks FIFO lots, realized PnL, rebates, and preserves state across serialize/hydrate with 0 drift', () => {
    const reconciler = new PolymarketOrderReconciler(1000);
    reconciler.createOrder({
      intentId: 'int-buy-1', orderId: 'ord-buy-1', marketId: 'mkt-1',
      tokenId: 'tok-yes', side: 'BUY', requestedSize: 20, limitPrice: 0.40, timestamp: 1000,
    });
    reconciler.applyEvent({
      eventId: 'ev-buy-1', orderId: 'ord-buy-1', type: 'FILLED',
      fillSize: 20, fillPrice: 0.40, feeUsdc: 0.05, rebateUsdc: 0.02, timestamp: 1005,
    });

    reconciler.createOrder({
      intentId: 'int-sell-1', orderId: 'ord-sell-1', marketId: 'mkt-1',
      tokenId: 'tok-yes', side: 'SELL', requestedSize: 10, limitPrice: 0.60, timestamp: 2000,
    });
    reconciler.applyEvent({
      eventId: 'ev-sell-1', orderId: 'ord-sell-1', type: 'FILLED',
      fillSize: 10, fillPrice: 0.60, feeUsdc: 0.03, liquidityRewardUsdc: 0.01, timestamp: 2005,
    });

    const summary = reconciler.reconcile();
    expect(summary.unexplainedDriftUsdc).toBe(0);
    expect(summary.positionsByToken['tok-yes']).toBe(10);
    expect(summary.fifoLedger!.openSharesMicroByToken['tok-yes']).toBe(10 * MICRO_PER_PUSD);
    expect(summary.fifoLedger!.accruedRebateIncomeMicro).toBe(20_000);
    expect(summary.fifoLedger!.accruedLiquidityRewardMicro).toBe(10_000);
    expect(summary.fifoLedger!.realizedTradingPnlMicro).toBeGreaterThan(0);

    const hydrated = new PolymarketOrderReconciler(500);
    hydrated.hydrate(reconciler.serialize());
    const hydratedSummary = hydrated.reconcile();
    expect(hydratedSummary.unexplainedDriftUsdc).toBe(0);
    expect(hydratedSummary.fifoLedger).toEqual(summary.fifoLedger);
  });
});

describe('Seam 3: OnchainOfiVpinEstimator & LogOddsAvellanedaStoikovMarketMaker in MarketMakerStrategy', () => {
  const sampleBook: RawOrderBook = {
    market: '0xcond-1', asset_id: '0xyes-1', hash: 'h1', timestamp: String(Date.now()),
    bids: [{ price: '0.49', size: '1200' }, { price: '0.48', size: '800' }],
    asks: [{ price: '0.51', size: '1100' }, { price: '0.52', size: '900' }],
  };

  it('computes log-odds AS quotes and halts quoting when VPIN > 0.70 (state === 3)', async () => {
    const clobClient = { getOrderBook: vi.fn().mockResolvedValue(sampleBook) } as unknown as ClobClient;
    const mm = new MarketMakerStrategy(
      clobClient,
      {
        name: 'mm-v2', enabled: true, maxCapitalUsdc: 1000,
        params: { refreshIntervalMs: 0, minLiquidity: 100, useLogOddsAsQuoting: true, vpinKillSwitchThreshold: 0.70 },
      },
      '1000',
    );
    mm.addMarket({ yesTokenId: '0xyes-1', noTokenId: '0xno-1', conditionId: '0xcond-1', volume: 50_000, liquidity: 10_000 });

    await mm.executeTick();
    const stateAfterNormal = mm.getMarketState('0xcond-1')!;
    expect(stateAfterNormal.haltedByToxicRegime).toBe(false);
    expect(stateAfterNormal.v2Telemetry?.logOddsQuote).toBeDefined();
    expect(stateAfterNormal.v2Telemetry!.logOddsQuote!.bidProbability).toBeLessThan(
      stateAfterNormal.v2Telemetry!.logOddsQuote!.askProbability,
    );

    const prevBidPlaced = stateAfterNormal.bidPlaced;
    mm.setMarketVpinOverride('0xcond-1', 0.82);
    const killEvents: Array<{ conditionId: string; vpin: number }> = [];
    mm.on('toxicKillSwitch', (ev) => killEvents.push(ev));

    await mm.executeTick();
    const stateAfterToxic = mm.getMarketState('0xcond-1')!;
    expect(stateAfterToxic.haltedByToxicRegime).toBe(true);
    expect(stateAfterToxic.v2Telemetry?.regime.state).toBe(3);
    expect(stateAfterToxic.v2Telemetry?.regime.isToxicKillSwitchTriggered).toBe(true);
    expect(stateAfterToxic.bidPlaced).toBe(prevBidPlaced);
    expect(killEvents).toHaveLength(1);
    await mm.stop();
  });
});
