import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LivePositionTracker } from '../../src/desk/execution/live-position-tracker';
import { LiveOrderManager } from '../../src/desk/execution/live-order-manager';
import { computePendingRiskAdjustments } from '../../src/desk/execution/live-order-manager-types';
import { PolymarketV2PreTradeRiskGate } from '../../src/desk/execution/polymarket-v2-pretrade-risk-gate';
import {
  buildPreTradeCandidateFromIntent,
  validateIntentWithPolymarketV2Gate,
  validateOrchestratorOrderV2,
} from '../../src/desk/execution/polymarket-v2-pretrade-bridge';
import { LiveTradingOrchestrator } from '../../src/desk/polymarket/live-trading-orchestrator';
import { StrategyLiveBridge } from '../../src/desk/polymarket/strategy-live-bridge';
import { cleanJournalFiles } from '../../src/desk/polymarket/__tests__/strategy-runner-fixtures';
import type { PolymarketAdapter } from '../../src/desk/execution/polymarket-adapter';
import type { PolymarketOrder } from '../../src/desk/execution/polymarket-signer';
import type { UnifiedTradeIntent } from '../../src/desk/orchestrator/orchestrator-types';

describe('Polymarket V4 Orchestrator & OrderManager End-to-End Runtime Wiring', () => {
  beforeEach(() => cleanJournalFiles());
  afterEach(() => cleanJournalFiles());

  describe('LivePositionTracker balance & token exposure helpers', () => {
    it('computes getFreeBalanceUsd and getTokenExposureUsd accurately across fills and price updates', () => {
      const tracker = new LivePositionTracker(1_000);
      expect(tracker.getFreeBalanceUsd()).toBe(1_000);
      expect(tracker.getTokenExposureUsd('tok-alpha')).toBe(0);

      tracker.recordFill({
        orderId: 'o-1',
        tokenId: 'tok-alpha',
        side: 'BUY',
        size: 200,
        price: 0.5,
        filledAt: Date.now(),
      });

      // Exposure = 200 * 0.5 = 100 USD -> free balance = 1000 - 100 = 900 USD
      expect(tracker.getTokenExposureUsd('tok-alpha')).toBeCloseTo(100, 6);
      expect(tracker.getFreeBalanceUsd()).toBeCloseTo(900, 6);

      // Partial exit of 100 shares at 0.7 -> realized PnL = +20 USD, remaining exposure = 100 * 0.7 = 70 USD
      tracker.updatePrices(new Map([['tok-alpha', { bid: 0.7, ask: 0.7 }]]));
      tracker.recordFill({
        orderId: 'o-2',
        tokenId: 'tok-alpha',
        side: 'SELL',
        size: 100,
        price: 0.7,
        filledAt: Date.now(),
      });

      expect(tracker.getRealizedPnl()).toBeCloseTo(20, 6);
      expect(tracker.getTokenExposureUsd('tok-alpha')).toBeCloseTo(70, 6);
      // Free balance uses open cost basis (100 * 0.5 = 50 USD): 1000 + 20 - 50 = 970 USD
      expect(tracker.getFreeBalanceUsd()).toBeCloseTo(970, 6);
      expect(tracker.isPositionReducingOrder('tok-alpha', 'SELL', 100)).toBe(true);
      expect(tracker.isPositionReducingOrder('tok-alpha', 'SELL', 101)).toBe(false);
      expect(tracker.isPositionReducingOrder('tok-alpha', 'BUY', 50)).toBe(false);
    });
  });

  describe('LiveTradingOrchestrator PAPER mode V2 pre-trade risk gate & tickSizeMicro', () => {
    let orchestrator: LiveTradingOrchestrator;

    beforeEach(async () => {
      orchestrator = new LiveTradingOrchestrator({
        capitalUsdc: 1_000,
        paperTrading: true,
        maxPositionFraction: 0.5,
        preTradeRiskGateConfigV2: {
          maxMarketExposureMicro: 300_000_000, // $300 cap per market
        },
      });
      await orchestrator.start();
    });

    it('accepts tick-aligned order and rejects off-tick order until authoritative tickSizeMicro resolver allows 0.001 tick', async () => {
      const baseOrder: PolymarketOrder = {
        tokenId: 'tok-tick-test',
        side: 'BUY',
        price: 0.655, // requires 0.001 tick (1_000 micro); default is 0.01 tick (10_000 micro)
        size: 10,
        expiration: Math.floor(Date.now() / 1000) + 300,
        nonce: '1',
        feeRateBps: 0,
        signatureType: 0,
      };

      await expect(orchestrator.placeOrder(baseOrder)).rejects.toThrow(
        /RISK_GATE_REJECTED: PRICE_NOT_ALIGNED_TO_TICK/,
      );

      // Wire authoritative tickSizeMicro resolver (e.g. from OrderBookStream.getTickSizeMicro)
      orchestrator.setTickSizeMicroResolver((tokenId) =>
        tokenId === 'tok-tick-test' ? 1_000 : 10_000,
      );
      expect(orchestrator.getTickSizeMicro('tok-tick-test')).toBe(1_000);

      const res = await orchestrator.placeOrder(baseOrder);
      expect(res.orderID).toMatch(/^paper-/);
      expect(res.status).toBe('matched');
    });

    it('enforces maxMarketExposureMicro using live LivePositionTracker token exposure', async () => {
      // First order: 400 shares @ $0.50 = $200 notional (under $300 market cap and $500 guard cap)
      const firstOrder: PolymarketOrder = {
        tokenId: 'tok-cap-test',
        side: 'BUY',
        price: 0.5,
        size: 400,
        expiration: Math.floor(Date.now() / 1000) + 300,
        nonce: '10',
        feeRateBps: 0,
        signatureType: 0,
      };
      const firstRes = await orchestrator.placeOrder(firstOrder);
      expect(firstRes.status).toBe('matched');

      // Second order on same token: 300 shares @ $0.50 = $150 notional -> projected exposure $350 > $300 cap
      const secondOrder: PolymarketOrder = {
        ...firstOrder,
        size: 300,
        nonce: '11',
      };
      await expect(orchestrator.placeOrder(secondOrder)).rejects.toThrow(
        /RISK_GATE_REJECTED: MARKET_EXPOSURE_CAP_EXCEEDED/,
      );

      // Position-reducing SELL order of 400 shares @ $0.50 closes the position and is allowed even near the cap
      const closeOrder: PolymarketOrder = {
        ...firstOrder,
        side: 'SELL',
        size: 400,
        nonce: '12',
      };
      const closeRes = await orchestrator.placeOrder(closeOrder);
      expect(closeRes.status).toBe('matched');
      expect(orchestrator.getPositionSummary().totalExposure).toBe(0);
    });

    it('accepts 0.0001 tick (100 micro-units) when authoritative tickSizeMicro resolver returns 100', async () => {
      orchestrator.setTickSizeMicroResolver((tokenId) =>
        tokenId === 'tok-submill' ? 100 : 10_000,
      );
      const subMillOrder: PolymarketOrder = {
        tokenId: 'tok-submill',
        side: 'BUY',
        price: 0.5432, // aligned to 0.0001 tick (100 micro-units)
        size: 10,
        expiration: Math.floor(Date.now() / 1000) + 300,
        nonce: '20',
        feeRateBps: 0,
        signatureType: 0,
      };
      const res = await orchestrator.placeOrder(subMillOrder);
      expect(res.status).toBe('matched');
    });
  });

  describe('LiveOrderManager feeRateBps resolution and V2 risk context wiring', () => {
    it('resolves feeRateBps from signal or adapter.getFeeRate and enforces V2 gate with tracker & tick resolver', async () => {
      const prevLiveEnabled = process.env['LIVE_TRADING_ENABLED'];
      process.env['LIVE_TRADING_ENABLED'] = 'true';

      try {
        const placedOrders: PolymarketOrder[] = [];
        const mockAdapter = {
          getFeeRate: vi.fn().mockResolvedValue({ tokenId: 'tok-live-1', feeRateBps: 175 }),
          placeOrder: vi.fn().mockImplementation(async (order: PolymarketOrder) => {
            placedOrders.push(order);
            return {
              orderID: `live-order-${placedOrders.length}`,
              status: 'matched',
              filledSize: order.size,
              fillPrice: order.price,
            };
          }),
          getOrderStatus: vi.fn(),
          cancelOrder: vi.fn(),
        } as unknown as PolymarketAdapter;

        const tracker = new LivePositionTracker(500);
        const v2Gate = new PolymarketV2PreTradeRiskGate({
          maxMarketExposureMicro: 200_000_000, // $200 market cap
        });
        const tickResolver = vi.fn((tokenId: string) => (tokenId === 'tok-fine' ? 1_000 : 10_000));

        const manager = new LiveOrderManager(
          mockAdapter,
          tracker,
          60_000,
          undefined,
          v2Gate,
          tickResolver,
        );

        // 1. Signal without explicit feeRateBps queries adapter.getFeeRate -> 175 bps
        const res1 = await manager.submitSignal(
          {
            tokenId: 'tok-live-1',
            side: 'BUY',
            price: 0.5,
            size: 100, // $50 notional
            timestamp: Date.now(),
          },
          'strat-alpha',
        );
        expect(res1.orderID).toBe('live-order-1');
        expect(placedOrders[0]?.feeRateBps).toBe(175);
        expect(mockAdapter.getFeeRate).toHaveBeenCalledWith('tok-live-1');

        // 2. Signal with explicit feeRateBps=250 uses signal value directly
        await manager.submitSignal(
          {
            tokenId: 'tok-fine',
            side: 'BUY',
            price: 0.625, // valid under 1_000 micro tick from tickResolver
            size: 50,
            feeRateBps: 250,
            timestamp: Date.now(),
          },
          'strat-alpha',
        );
        expect(placedOrders[1]?.feeRateBps).toBe(250);
        expect(tickResolver).toHaveBeenCalledWith('tok-fine');

        // 3. Signal exceeding $200 market cap on tok-live-1 (already has $50 exposure from fill 1) is rejected
        await expect(
          manager.submitSignal(
            {
              tokenId: 'tok-live-1',
              side: 'BUY',
              price: 0.5,
              size: 350, // $175 notional + $50 existing = $225 > $200 cap
              timestamp: Date.now(),
            },
            'strat-alpha',
          ),
        ).rejects.toThrow(/RISK_GATE_REJECTED: MARKET_EXPOSURE_CAP_EXCEEDED/);

        // 4. Direct submitAndTrack with feeRateBps=0 resolves live feeRateBps via adapter.getFeeRate
        await manager.submitAndTrack({
          tokenId: 'tok-live-1',
          side: 'SELL', // position-reducing exit of 100 shares
          price: 0.5,
          size: 100,
          expiration: Math.floor(Date.now() / 1000) + 300,
          nonce: '99',
          feeRateBps: 0,
          signatureType: 0,
        });
        expect(placedOrders[2]?.feeRateBps).toBe(175);

        // 5. Pending activeOrders commitment is counted against market exposure cap
        manager.activeOrders.set('pending-1', {
          orderId: 'pending-1',
          tokenId: 'tok-live-1',
          side: 'BUY',
          size: 300,
          price: 0.5, // $150 pending notional
          status: 'pending',
          submittedAt: Date.now(),
          lastPollAt: Date.now(),
          pollAttempts: 0,
        });
        await expect(
          manager.submitSignal(
            {
              tokenId: 'tok-live-1',
              side: 'BUY',
              price: 0.5,
              size: 150, // $75 new + $150 pending = $225 > $200 cap
              timestamp: Date.now(),
            },
            'strat-alpha',
          ),
        ).rejects.toThrow(/RISK_GATE_REJECTED: MARKET_EXPOSURE_CAP_EXCEEDED/);
      } finally {
        if (prevLiveEnabled === undefined) {
          delete process.env['LIVE_TRADING_ENABLED'];
        } else {
          process.env['LIVE_TRADING_ENABLED'] = prevLiveEnabled;
        }
      }
    });
  });

  describe('StrategyLiveBridge feeRateBps forwarding and RISK_GATE_REJECTED handling', () => {
    it('forwards signal.feeRateBps to orchestrator.placeOrder and classifies RISK_GATE_REJECTED as rejected', async () => {
      const orchestrator = new LiveTradingOrchestrator({
        capitalUsdc: 1_000,
        paperTrading: true,
        maxPositionFraction: 0.5,
      });
      await orchestrator.start();

      const placeOrderSpy = vi.spyOn(orchestrator, 'placeOrder');
      const bridge = new StrategyLiveBridge(orchestrator);

      // Valid signal with explicit feeRateBps
      const okResult = await bridge.onSignal({
        tokenId: 'tok-bridge-1',
        side: 'BUY',
        price: 0.6,
        size: 20,
        feeRateBps: 150,
        timestamp: Date.now(),
      });
      expect(okResult.rejected).toBe(false);
      expect(okResult.response?.status).toBe('matched');
      expect(placeOrderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'tok-bridge-1',
          feeRateBps: 150,
        }),
      );

      // Off-tick signal rejected by V2 risk gate -> classified as rejected: true
      const rejectedResult = await bridge.onSignal({
        tokenId: 'tok-bridge-1',
        side: 'BUY',
        price: 0.605, // invalid for 0.01 default tick
        size: 20,
        timestamp: Date.now(),
      });
      expect(rejectedResult.rejected).toBe(true);
      expect(rejectedResult.rejectReason).toContain('RISK_GATE_REJECTED: PRICE_NOT_ALIGNED_TO_TICK');
      expect(bridge.getStats().signalsRejected).toBe(1);
    });
  });

  describe('Pre-trade bridge intent helpers, non-finite terms, and pending order adjustments', () => {
    it('builds and validates UnifiedTradeIntent candidates across polymarket_clob and non-polymarket venues', () => {
      const gate = new PolymarketV2PreTradeRiskGate({
        maxMarketExposureMicro: 300_000_000,
      });

      const nonPolyIntent = {
        intentId: 'int-1',
        strategyId: 's1',
        venue: 'binance_spot',
        symbol: 'BTCUSDT',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 1,
        limitPrice: 50_000,
        timestamp: Date.now(),
      } as unknown as UnifiedTradeIntent;

      const nonPolyRes = validateIntentWithPolymarketV2Gate(gate, nonPolyIntent, 0.5, 100);
      expect(nonPolyRes.allowed).toBe(true);
      expect(nonPolyRes.requiredNotionalMicro).toBe(0);

      const polyIntent = {
        intentId: 'int-2',
        strategyId: 's2',
        venue: 'polymarket_clob',
        symbol: 'tok-poly',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 100,
        timestamp: Date.now(),
        metadata: {
          isLimitOrder: false,
          isMarketBuyFakOrFok: true,
          isPositionReducing: false,
          rawFreeBalanceMicro: 400_000_000,
          currentMarketExposureMicro: 150_000_000,
          tickSizeMicro: 10_000,
          currentVpin: 0.2,
          clusterCvar99Pct: 0.02,
          consecutiveBookErrors: 0,
        },
      } as unknown as UnifiedTradeIntent;

      const candidate = buildPreTradeCandidateFromIntent(polyIntent, 0.5, 100, {
        rawFreeBalanceUsd: 350, // tighter than 400 -> min(350M, 400M) = 350M
        currentMarketExposureUsd: 180, // higher than 150 -> max(180M, 150M) = 180M
      });
      expect(candidate.rawFreeBalanceMicro).toBe(350_000_000);
      expect(candidate.currentMarketExposureMicro).toBe(180_000_000);
      expect(candidate.isLimitOrder).toBe(false);
      expect(candidate.isMarketBuyFakOrFok).toBe(true);

      const polyRes = validateIntentWithPolymarketV2Gate(gate, polyIntent, 0.5, 1, {
        rawFreeBalanceUsd: 350,
        currentMarketExposureUsd: 100, // 0.5 * 1 = $0.50 <= $1.00 FAK/FOK cap
      });
      expect(polyRes.allowed).toBe(true);
    });

    it('fails closed on non-finite order terms in validateOrchestratorOrderV2 and handles computePendingRiskAdjustments edge cases', () => {
      const gate = new PolymarketV2PreTradeRiskGate();
      const tracker = new LivePositionTracker(1_000);
      const recordEvent = vi.fn();
      const journal = { recordEvent } as unknown as Parameters<typeof validateOrchestratorOrderV2>[0]['journal'];

      expect(() =>
        validateOrchestratorOrderV2({
          polymarketV2Gate: gate,
          positionTracker: tracker,
          journal,
          order: {
            tokenId: 'tok-nan',
            side: 'BUY',
            price: Number.NaN,
            size: 10,
            expiration: 0,
            nonce: '1',
            feeRateBps: 0,
            signatureType: 0,
          },
        }),
      ).toThrow(/RISK_GATE_REJECTED: NON_FINITE_ORDER_TERMS/);
      expect(recordEvent).toHaveBeenCalledWith('v2_risk_gate_reject', {
        tokenId: 'tok-nan',
        reason: 'NON_FINITE_ORDER_TERMS',
      });

      // computePendingRiskAdjustments with undefined map and opposite-side orders
      expect(computePendingRiskAdjustments(undefined, 'tok-1', 'BUY')).toEqual({
        pendingFreeNotionalUsd: 0,
        pendingSameSideUsd: 0,
        pendingOppositeShares: 0,
      });

      const activeMap = new Map([
        [
          'o-opp',
          {
            orderId: 'o-opp',
            tokenId: 'tok-1',
            side: 'BUY' as const,
            size: 40,
            price: 0.5,
            status: 'delayed' as const,
            submittedAt: Date.now(),
            lastPollAt: Date.now(),
            pollAttempts: 1,
          },
        ],
        [
          'o-done',
          {
            orderId: 'o-done',
            tokenId: 'tok-1',
            side: 'SELL' as const,
            size: 20,
            price: 0.5,
            status: 'matched' as const,
            submittedAt: Date.now(),
            lastPollAt: Date.now(),
            pollAttempts: 1,
          },
        ],
      ]);
      const adj = computePendingRiskAdjustments(activeMap, 'tok-1', 'SELL');
      expect(adj.pendingFreeNotionalUsd).toBe(20);
      expect(adj.pendingSameSideUsd).toBe(0);
      expect(adj.pendingOppositeShares).toBe(40);
    });

    it('covers getFeeRate fallback on error, submitOnly V2 rejection, and empty orderID rejection', async () => {
      const prevLiveEnabled = process.env['LIVE_TRADING_ENABLED'];
      process.env['LIVE_TRADING_ENABLED'] = 'true';
      try {
        const mockAdapter = {
          getFeeRate: vi.fn().mockRejectedValue(new Error('fee endpoint timeout')),
          placeOrder: vi.fn().mockResolvedValue({ orderID: '', status: 'pending' }),
          getOrderStatus: vi.fn(),
          cancelOrder: vi.fn(),
        } as unknown as PolymarketAdapter;

        const tracker = new LivePositionTracker(500);
        const v2Gate = new PolymarketV2PreTradeRiskGate();
        const manager = new LiveOrderManager(mockAdapter, tracker, 60_000, undefined, v2Gate);

        // submitSignal falls back to feeRateBps=0 when getFeeRate rejects, then rejects on empty orderID
        await expect(
          manager.submitSignal(
            {
              tokenId: 'tok-err',
              side: 'BUY',
              price: 0.5,
              size: 10,
              timestamp: Date.now(),
            },
            'strat-err',
          ),
        ).rejects.toThrow(/CLOB_ORDER_REJECTED: empty orderID/);

        // submitOnly rejects off-tick order via assertPolymarketV2OrderAllowed
        await expect(
          manager.submitOnly({
            tokenId: 'tok-err',
            side: 'BUY',
            price: 0.5005, // 500_500 micro -> off-tick for default 1_000 micro (0.001)
            size: 10,
            expiration: Math.floor(Date.now() / 1000) + 300,
            nonce: '2',
            feeRateBps: 0,
            signatureType: 0,
          }),
        ).rejects.toThrow(/RISK_GATE_REJECTED: PRICE_NOT_ALIGNED_TO_TICK/);

        // submitOnly rejects empty orderID when order passes V2 gate
        await expect(
          manager.submitOnly({
            tokenId: 'tok-err',
            side: 'BUY',
            price: 0.5,
            size: 10,
            expiration: Math.floor(Date.now() / 1000) + 300,
            nonce: '3',
            feeRateBps: 0,
            signatureType: 0,
          }),
        ).rejects.toThrow(/CLOB_ORDER_REJECTED: empty orderID/);
      } finally {
        if (prevLiveEnabled === undefined) {
          delete process.env['LIVE_TRADING_ENABLED'];
        } else {
          process.env['LIVE_TRADING_ENABLED'] = prevLiveEnabled;
        }
      }
    });
  });
});
