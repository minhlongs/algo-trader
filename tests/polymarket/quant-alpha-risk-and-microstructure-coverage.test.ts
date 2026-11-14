import { describe, expect, it, vi } from 'vitest';
import { LiveExecutionGuard } from '../../src/desk/execution/live-execution-guard';
import { LivePositionTracker } from '../../src/desk/execution/live-position-tracker';
import { LiveTradingJournal } from '../../src/desk/execution/live-trading-journal';
import { PolymarketOrderReconciler } from '../../src/desk/execution/polymarket-order-reconciler';
import type { PolymarketOrder } from '../../src/desk/execution/polymarket-signer';
import { createOrchestratorPolyRiskRuntime } from '../../src/desk/polymarket/live-trading-poly-risk-gate';
import { PaperLegDecayTracker } from '../../src/desk/polymarket/paper-orderbook-simulator';
import {
  PolymarketMicrostructureTracker,
  executeOrchestratorMarketRedemption,
} from '../../src/desk/polymarket/polymarket-microstructure-tracker';
import {
  fetchRealPositions,
  fetchRealTrades,
  printRealLedger,
  showRealLedger,
} from '../../src/desk/polymarket/real-trade-ledger';
import { StrategyLiveBridge } from '../../src/desk/polymarket/strategy-live-bridge';
import type { LiveTradingOrchestrator } from '../../src/desk/polymarket/live-trading-orchestrator';

describe('Orchestrator PolyRisk runtime, microstructure tracker, and real ledger coverage', () => {
  it('handles undefined tokenId safely on kill-switch and invalid-intent denials, drawdown auto-halt, and open-order cancellation', async () => {
    const positionTracker = new LivePositionTracker(1_000);
    const reconciler = new PolymarketOrderReconciler(1_000);
    const journal = new LiveTradingJournal();
    const guard = new LiveExecutionGuard({
      capitalUsdc: 1_000,
      maxPositionFraction: 0.5,
      maxDailyDrawdown: 0.2,
      maxConcurrentPositions: 10,
      maxConsecutiveLosses: 5,
      enabled: true,
    });
    guard.attachTracker(positionTracker);

    const config = {
      capitalUsdc: 1_000,
      paperTrading: false,
      enforcePolyRiskGate: true,
      maxPositionFraction: 0.5,
      killSwitchTransport: vi.fn(async () => ({ ok: true, status: 200, body: 'cancelled' })),
    };

    const runtime = createOrchestratorPolyRiskRuntime({
      config,
      getOrderManager: () => null,
      getPositionTracker: () => positionTracker,
      getReconciler: () => reconciler,
      getJournal: () => journal,
    });

    expect(runtime.getFeeScheduleResolver()).toBeUndefined();
    runtime.setFeeScheduleResolver({
      resolve: async (tokenId) =>
        tokenId === 'exempt-tok' ? null : { exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.2 },
    });
    expect(runtime.getFeeScheduleResolver()).not.toBeNull();
    runtime.recordMarketObservation(Date.now());

    // Undefined tokenId fails cleanly with INVALID_INTENT instead of TypeError on .slice()
    await expect(
      runtime.beforeOrder({ side: 'BUY', price: 0.5, size: 10 } as unknown as PolymarketOrder),
    ).rejects.toThrow(/PolyRisk blocked \[INVALID_INTENT\]/);

    // Exempt fee schedule (`resolve -> null`) passes authorizeOrder
    await runtime.authorizeOrder(
      { tokenId: 'exempt-tok', side: 'BUY', price: 0.5, size: 10, orderType: 'GTC' } as unknown as PolymarketOrder,
      guard,
    );

    // Seed an open reconciler order and verify listOpenOrders + cancelMatchingOrders
    reconciler.createOrder({
      intentId: 'open-1',
      orderId: 'open-1',
      marketId: 'mkt-open',
      tokenId: 'exempt-tok',
      side: 'BUY',
      requestedSize: 20,
      limitPrice: 0.45,
      timestamp: Date.now(),
    });
    reconciler.applyEvent({ eventId: 'e-sub', orderId: 'open-1', type: 'SUBMITTED', timestamp: Date.now() });
    expect(runtime.listOpenOrders('exempt-tok')).toHaveLength(1);
    await runtime.cancelMatchingOrders('exempt-tok');
    expect(runtime.listOpenOrders('exempt-tok')).toEqual([]);

    // Guard rejection records safe tokenId prefix
    const tinyGuard = new LiveExecutionGuard({
      capitalUsdc: 100,
      maxPositionFraction: 0.01,
      enabled: true,
    });
    tinyGuard.attachTracker(positionTracker);
    await expect(
      runtime.authorizeOrder(
        { tokenId: 'exempt-tok', side: 'BUY', price: 0.5, size: 20, orderType: 'GTC' } as unknown as PolymarketOrder,
        tinyGuard,
      ),
    ).rejects.toThrow(/Guard rejected/);

    // Drawdown >= 5% triggers DRAWDOWN_AUTO_HALT and latches killSwitch
    positionTracker.recordFill({
      orderId: 'loss-buy',
      tokenId: 'loss-tok',
      side: 'BUY',
      price: 0.8,
      size: 200,
      filledAt: Date.now(),
    });
    positionTracker.recordFill({
      orderId: 'loss-sell',
      tokenId: 'loss-tok',
      side: 'SELL',
      price: 0.4,
      size: 200,
      filledAt: Date.now(),
    });
    await expect(
      runtime.beforeOrder({
        tokenId: 'exempt-tok',
        side: 'BUY',
        price: 0.5,
        size: 10,
        orderType: 'GTC',
      } as unknown as PolymarketOrder),
    ).rejects.toThrow(/DRAWDOWN_AUTO_HALT/);
    expect(runtime.isKillSwitchFired()).toBe(true);

    // Subsequent order with missing tokenId hits latched killSwitch cleanly without TypeError
    await expect(
      runtime.beforeOrder({ side: 'BUY', price: 0.5, size: 10 } as unknown as PolymarketOrder),
    ).rejects.toThrow(/KILL_SWITCH_ACTIVE/);

    runtime.resetPeakEquity();
  });

  it('tracks multi-snapshot 5-level OFI deltas, VPIN prints, book errors, and market redemption', () => {
    const tracker = new PolymarketMicrostructureTracker(100_000_000, 0.7);
    expect(tracker.getRiskContext('unknown-token')).toEqual({ currentVpin: 0, consecutiveBookErrors: 0 });

    tracker.recordBookError('tok-m');
    expect(tracker.getRiskContext('tok-m').consecutiveBookErrors).toBe(1);

    // First snapshot initializes state and resets consecutiveBookErrors
    tracker.recordOrderBookSnapshot('tok-m', {
      bids: [
        { price: '0.48', size: '100' },
        { price: '0.47', size: '80' },
      ],
      asks: [
        { price: '0.52', size: '100' },
        { price: '0.53', size: '80' },
      ],
    });
    expect(tracker.getRiskContext('tok-m').consecutiveBookErrors).toBe(0);

    // Second snapshot exercises improved bid, tightened ask, added level, and removed level
    const ofi2 = tracker.recordOrderBookSnapshot('tok-m', {
      bids: [
        { price: '0.49', size: '150' },
        { price: '0.47', size: '60' },
        { price: '0.46', size: '40' },
      ],
      asks: [{ price: '0.51', size: '90' }],
    });
    expect(ofi2.totalOfiLevelsActive).toBeGreaterThan(0);

    // Third snapshot exercises worsened bid and widened ask
    tracker.recordOrderBookSnapshot('tok-m', {
      bids: [{ price: '0.46', size: '50' }],
      asks: [{ price: '0.55', size: '120' }],
    });

    const vpin = tracker.recordTradePrint('tok-m', {
      makerAssetId: '0',
      sharesMicro: 250_000_000,
      notionalUsdMicro: 125_000_000,
    });
    expect(vpin).toBeGreaterThanOrEqual(0);
    const telemetry = tracker.getTelemetry('tok-m');
    expect(telemetry.tokenId).toBe('tok-m');
    expect(telemetry.midProbability).toBeCloseTo(0.505, 4);

    // Market redemption in LIVE mode (no disk side effects)
    const reconciler = new PolymarketOrderReconciler(1_000);
    const posTracker = new LivePositionTracker(1_000);
    const journal = new LiveTradingJournal();
    const decay = new PaperLegDecayTracker();

    reconciler.createOrder({
      intentId: 'red-1',
      orderId: 'red-1',
      marketId: 'mkt-red',
      tokenId: 'tok-red',
      side: 'BUY',
      requestedSize: 50,
      limitPrice: 0.6,
      timestamp: Date.now(),
    });
    reconciler.applyEvent({
      eventId: 'red-fill',
      orderId: 'red-1',
      type: 'FILLED',
      fillSize: 50,
      fillPrice: 0.6,
      feeUsdc: 0,
      timestamp: Date.now(),
    });
    posTracker.recordFill({
      orderId: 'red-1',
      tokenId: 'tok-red',
      side: 'BUY',
      price: 0.6,
      size: 50,
      filledAt: Date.now(),
    });

    const settled = executeOrchestratorMarketRedemption({
      reconciler,
      positionTracker: posTracker,
      journal,
      legDecayTracker: decay,
      startedAtMs: Date.now(),
      mode: 'LIVE',
      marketId: 'mkt-red',
      tokenId: 'tok-red',
      payoutPerShareUsdc: 1,
    });
    expect(settled.settledShares).toBe(50);
    expect(settled.payoutUsdc).toBe(50);
    expect(settled.settledRedemptionPnlUsdc).toBeCloseTo(20, 6);
  });

  it('refreshes live orderbook in StrategyLiveBridge scanner and exercises real-trade-ledger helpers', async () => {
    const getOrderBook = vi.fn().mockResolvedValue({ bids: [], asks: [] });
    const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-scan-1', status: 'matched' });
    const mockOrch = {
      getMode: () => 'LIVE' as const,
      getOrderBook,
      placeOrder,
      cancelOrder: vi.fn().mockResolvedValue(undefined),
      cancelAllOrders: vi.fn().mockResolvedValue(undefined),
      getOpenOrders: vi.fn().mockResolvedValue([]),
    } as unknown as LiveTradingOrchestrator;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/markets')) {
        return new Response(
          JSON.stringify([
            {
              id: 'm-end-1',
              question: 'High probability resolution?',
              conditionId: 'c-end-1',
              slug: 'high-prob',
              outcomes: JSON.stringify(['Yes', 'No']),
              outcomePrices: JSON.stringify(['0.97', '0.03']),
              clobTokenIds: JSON.stringify(['tok-end-yes', 'tok-end-no']),
              volume: '250000',
              liquidity: '50000',
              endDate: new Date(Date.now() + 3_600_000).toISOString(),
              active: true,
              closed: false,
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes('/positions')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                condition_id: 'c-pos-1',
                title: 'Macro position',
                outcome: 'Yes',
                current_size: 25,
                avg_price: 0.45,
                current_price: 0.55,
                unrealized_pnl: 2.5,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/trades')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                proxy_wallet: '0xabc',
                side: 'BUY',
                token_id: 'tok-pos-1',
                condition_id: 'c-pos-1',
                size: 25,
                price: 0.45,
                timestamp: 1_700_000_000,
                outcome: 'Yes',
                title: 'Macro position',
                slug: 'macro-pos',
                transaction_hash: '0x123',
              },
              {
                proxy_wallet: '0xabc',
                side: 'SELL',
                token_id: 'tok-pos-1',
                condition_id: 'c-pos-1',
                size: 10,
                price: 0.55,
                timestamp: 1_700_000_060,
                outcome: 'Yes',
                title: 'Macro position',
                slug: 'macro-pos',
                transaction_hash: '0x456',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const bridge = new StrategyLiveBridge(mockOrch);
    bridge.startEndgameScanner({ scanIntervalMs: 60_000, minVolume: 1_000, priceThreshold: 0.95 });
    await new Promise((r) => setTimeout(r, 30));
    bridge.stopScanner();

    expect(getOrderBook).toHaveBeenCalledWith('tok-end-yes');
    expect(placeOrder).toHaveBeenCalled();
    await bridge.cancelOrder('o1');
    await bridge.cancelAllOrders('tok-end-yes');
    expect(await bridge.getOpenOrders('tok-end-yes')).toEqual([]);

    const ledger = await fetchRealTrades('0xabc');
    expect(ledger.totalBuys).toBe(1);
    printRealLedger(ledger);
    const positions = await fetchRealPositions('0xabc');
    expect(positions).toHaveLength(1);
    await showRealLedger('0xabc');

    fetchSpy.mockRejectedValueOnce(new Error('network timeout'));
    expect(await fetchRealPositions('0xabc')).toEqual([]);
  });
});
