import { describe, expect, it, vi } from 'vitest';
import { calculateLegFee, calculatePolymarketFee } from '../../src/desk/arbitrage/profitability/fee-calculator';
import { BacktestOrderManager } from '../../src/desk/backtesting/backtest-order-manager';
import { applyVenueCosts } from '../../src/desk/backtesting/backtest-fee-application';
import { submitAndTrackOrder, type SubmissionHost } from '../../src/desk/execution/live-order-submission';
import { calcQuadraticTakerFeeRateV2 } from '../../src/desk/execution/polymarket-clob-v2-fee-math';
import { PolymarketOrderReconciler } from '../../src/desk/execution/polymarket-order-reconciler';
import { PolymarketV2PreTradeRiskGate } from '../../src/desk/execution/polymarket-v2-pretrade-risk-gate';
import type { PolymarketOrder } from '../../src/desk/execution/polymarket-signer';
import { normalizeConfig } from '../../src/desk/polymarket/live-trading-adapter-setup';
import { LiveTradingOrchestrator } from '../../src/desk/polymarket/live-trading-orchestrator';
import { DEFAULT_PAPER_FEE_SCHEDULE, sweepOrderBookLevels } from '../../src/desk/polymarket/paper-fill-sweep';
import type { PolymarketFeeSchedule } from '../../src/desk/polymarket/polymarket-fee-calculator';

describe('Quant Alpha merge & isolated code-review regressions', () => {
  it('forwards IOC orderType in live-order-submission so <5 share taker BUY >= $1.00 passes V2 gate', async () => {
    const placeOrder = vi.fn().mockResolvedValue({ orderID: 'ord-ioc-1', status: 'matched' });
    const host: SubmissionHost = {
      adapter: { placeOrder } as unknown as SubmissionHost['adapter'],
      positionTracker: {
        getFreeBalanceUsd: () => 500,
        getTokenExposureUsd: () => 0,
        isPositionReducingOrder: () => false,
      } as unknown as SubmissionHost['positionTracker'],
      activeOrders: new Map(),
      pollTimers: new Map(),
      stopped: false,
      config: { pollIntervalMs: 500, maxPollAttempts: 3 },
      polymarketV2Gate: new PolymarketV2PreTradeRiskGate(),
      handleFill: vi.fn(),
      schedulePoll: vi.fn(),
    };
    const order: PolymarketOrder = {
      salt: '1',
      maker: '0x0000000000000000000000000000000000000001',
      signer: '0x0000000000000000000000000000000000000001',
      taker: '0x0000000000000000000000000000000000000000',
      tokenId: 'tok-ioc',
      makerAmount: '2000000',
      takerAmount: '4000000',
      expiration: '0',
      nonce: '0',
      feeRateBps: 0,
      side: 'BUY',
      signatureType: 0,
      signature: '0xsig',
      price: 0.5,
      size: 4,
      orderType: 'IOC',
    };

    await expect(submitAndTrackOrder(host, order)).rejects.toThrow(/LIVE_TRADING_ENABLED/);
    expect(placeOrder).not.toHaveBeenCalled();

    await expect(
      submitAndTrackOrder(host, { ...order, orderType: 'GTC' }),
    ).rejects.toThrow(/RISK_GATE_REJECTED: BELOW_MIN_LIMIT_SHARES/);
  });

  it('rejects non-marketable IOC/FOK, partial FOK sweeps, and cancels partial IOC remainders so getOpenOrders stays empty', async () => {
    const book = {
      bids: [{ price: '0.45', size: '50' }],
      asks: [{ price: '0.55', size: '10' }],
    };

    const nonMarketableIoc = sweepOrderBookLevels({
      book,
      side: 'BUY',
      requestedSize: 10,
      limitPrice: 0.45,
      schedule: DEFAULT_PAPER_FEE_SCHEDULE,
      orderType: 'IOC',
    });
    expect(nonMarketableIoc.status).toBe('unmatched');
    expect(nonMarketableIoc.lifecycleType).toBe('REJECTED');
    expect(nonMarketableIoc.rejectReason).toMatch(/IOC order not marketable/);

    const partialFok = sweepOrderBookLevels({
      book,
      side: 'BUY',
      requestedSize: 25,
      limitPrice: 0.60,
      schedule: DEFAULT_PAPER_FEE_SCHEDULE,
      orderType: 'FOK',
    });
    expect(partialFok.status).toBe('unmatched');
    expect(partialFok.lifecycleType).toBe('REJECTED');
    expect(partialFok.filledSize).toBe(0);
    expect(partialFok.rejectReason).toMatch(/FOK order insufficient depth/);

    const orch = new LiveTradingOrchestrator({
      capitalUsdc: 10_000,
      paperTrading: true,
      feeScheduleResolver: { resolve: async () => DEFAULT_PAPER_FEE_SCHEDULE },
    });
    orch.setPaperOrderBookProvider(async () => book);
    await orch.start();
    try {
      const res = await orch.placeOrder({
        tokenId: 'tok-ioc-partial',
        side: 'BUY',
        price: 0.60,
        size: 25,
        orderType: 'IOC',
      } as unknown as PolymarketOrder);
      expect(res.status).toBe('matched');
      expect(Number(res.filledSize)).toBe(10);
      const openOrders = await orch.getOpenOrders('tok-ioc-partial');
      expect(openOrders).toEqual([]);
    } finally {
      await orch.stop();
    }
  });

  it('enforces PolyRisk fail-closed by default in LIVE mode even when feeScheduleResolver is omitted', () => {
    const normalized = normalizeConfig({ capitalUsdc: 5_000, paperTrading: false });
    expect(normalized.enforcePolyRiskGate).toBe(true);

    const paperNormalized = normalizeConfig({ capitalUsdc: 5_000, paperTrading: true });
    expect(paperNormalized.enforcePolyRiskGate).toBe(false);
  });

  it('credits negative maker feeUsdc into FIFO accruedRebateIncomeMicro without negative taker fees', () => {
    const reconciler = new PolymarketOrderReconciler(1000);
    reconciler.createOrder({
      intentId: 'intent-maker-1',
      orderId: 'order-maker-1',
      marketId: 'mkt-1',
      tokenId: 'tok-1',
      side: 'BUY',
      requestedSize: 100,
      limitPrice: 0.5,
      timestamp: 1_700_000_000_000,
    });
    reconciler.applyEvent({
      eventId: 'evt-maker-fill',
      orderId: 'order-maker-1',
      type: 'FILLED',
      fillSize: 100,
      fillPrice: 0.5,
      feeUsdc: -0.1875,
      timestamp: 1_700_000_000_100,
    });

    const summary = reconciler.reconcile();
    expect(summary.unexplainedDriftUsdc).toBe(0);
    expect(summary.cashUsdc).toBeCloseTo(950.1875, 6);
    expect(summary.fifoLedger?.totalTakerFeesPaidMicro).toBe(0);
    expect(summary.fifoLedger?.accruedRebateIncomeMicro).toBe(187_500);
    expect(summary.fifoLedger?.openCostBasisMicroByToken['tok-1']).toBe(50_000_000);
  });

  it('fails closed on whitespace marketDescription and non-finite inputs across fee-calculator and V2 math', () => {
    expect(calcQuadraticTakerFeeRateV2('crypto', Number.NaN)).toBe(0);
    expect(calcQuadraticTakerFeeRateV2('crypto', Number.POSITIVE_INFINITY)).toBe(0);

    const legFee = calculateLegFee(
      {
        venue: 'polymarket',
        symbol: 'tok-blank',
        side: 'buy',
        price: 0.5,
        size: 10,
        marketDescription: '   ',
      },
      5,
    );
    expect(legFee).toEqual({ available: false, venue: 'polymarket', symbol: 'tok-blank' });

    expect(
      calculateLegFee(
        {
          venue: 'polymarket',
          symbol: 'tok-nan',
          side: 'buy',
          price: Number.NaN,
          size: 10,
          polymarketCategory: 'crypto',
        },
        10,
      ),
    ).toEqual({ available: false, venue: 'polymarket', symbol: 'tok-nan' });

    expect(
      calculateLegFee(
        { venue: 'binance', symbol: 'BTCUSDT', side: 'buy', price: 0.5, size: 10 },
        10,
        Number.NaN,
      ),
    ).toEqual({ available: false, venue: 'binance', symbol: 'BTCUSDT' });

    const nanRes = calculatePolymarketFee('crypto', Number.NaN, 100);
    expect(nanRes).toEqual({ rate: 0, feeUsd: 0, rebateUsd: 0 });
  });

  it('prefers resolved PolymarketFeeSchedule over clobV2Category and forwards bundle V2 options', async () => {
    const schedule: PolymarketFeeSchedule = {
      exponent: 1,
      rate: 0.04,
      takerOnly: true,
      rebateRate: 0.2,
    };
    const withSchedule = applyVenueCosts({
      price: 0.6,
      entryPrice: 0.4,
      size: 100,
      grossPnl: 20,
      schedule,
      clobV2Category: 'crypto',
    });
    const scheduleOnly = applyVenueCosts({
      price: 0.6,
      entryPrice: 0.4,
      size: 100,
      grossPnl: 20,
      schedule,
    });
    expect(withSchedule).toEqual(scheduleOnly);

    const om = new BacktestOrderManager(1000, { clobV2Category: 'crypto', postOnly: true });
    await om.placeOrder({ tokenId: 'leg-a', side: 'buy', price: 0.45, size: 100, orderType: 'GTC' });
    await om.placeOrder({ tokenId: 'leg-b', side: 'buy', price: 0.45, size: 100, orderType: 'GTC' });
    const netPnl = await om.settleBundleConversion({
      legs: [
        { tokenId: 'leg-a', aggressive: false },
        { tokenId: 'leg-b', aggressive: false },
      ],
      quantity: 100,
      payoutPerBundlePusd: 0.98,
    });
    const fillCosts = om.getFillCosts();
    expect(fillCosts).toHaveLength(2);
    expect(fillCosts[0]!.rebateUsd).toBeGreaterThan(0);
    expect(netPnl).toBeGreaterThan(8);
  });
});
