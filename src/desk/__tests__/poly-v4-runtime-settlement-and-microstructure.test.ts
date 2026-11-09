import * as fs from 'fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { LiveTradingOrchestrator } from '../polymarket/live-trading-orchestrator';
import { PolymarketSettlementListener } from '../polymarket/polymarket-settlement-listener';
import { RECONCILER_STATE_FILE } from '../polymarket/g2-shadow-telemetry';
import { cashclawPath } from '../../shared/persistence/file-store';
import { LivePositionTracker } from '../execution/live-position-tracker';
import { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import { LiveOrderManager } from '../execution/live-order-manager';
import { PolymarketV2PreTradeRiskGate } from '../execution/polymarket-v2-pretrade-risk-gate';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import type { PolymarketAdapter } from '../execution/polymarket-adapter';

function makeOrder(overrides: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return {
    tokenId: 'token-yes-runtime-v4', price: 0.50, size: 100, side: 'BUY', feeRateBps: 200,
    nonce: '1', expiration: Math.floor(Date.now() / 1000) + 3600, signatureType: 0, ...overrides,
  };
}

describe('Polymarket Runtime Settlement, VWAP MTM & Microstructure Risk Gate Wiring', () => {
  beforeEach(() => {
    delete process.env['PAPER_MODE'];
    for (const file of [RECONCILER_STATE_FILE, cashclawPath('live-positions.json'), cashclawPath('live-pnl.json')]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  it('settles binary market redemption across reconciler, position tracker, and journal with zero drift', async () => {
    const orchestrator = new LiveTradingOrchestrator({
      capitalUsdc: 10_000, paperTrading: true, maxPositionFraction: 0.25,
    });
    orchestrator.setPaperOrderBookProvider(async () => ({
      bids: [{ price: '0.49', size: '500' }],
      asks: [{ price: '0.50', size: '500' }],
    }));

    await orchestrator.start();
    const res = await orchestrator.placeOrder(makeOrder({ size: 100, price: 0.50 }));
    expect(res.status).toBe('matched');
    expect(orchestrator.getPositions()).toHaveLength(1);

    const mtm = orchestrator.computeUnrealizedMtm(
      'token-yes-runtime-v4',
      [{ price: 0.60, size: 60 }, { price: 0.55, size: 60 }],
      0,
    );
    expect(mtm.filledSharesMicro).toBe(100_000_000);
    expect(mtm.vwapBidMicro).toBe(580_000);
    expect(mtm.fullyFillable).toBe(true);
    expect(mtm.unrealizedMtmUsdc).toBeGreaterThan(0);

    const settlement = orchestrator.settleMarketRedemption({
      marketId: 'cond-runtime-1', tokenId: 'token-yes-runtime-v4', payoutPerShareUsdc: 1,
    });
    expect(settlement.settledShares).toBe(100);
    expect(settlement.payoutUsdc).toBeCloseTo(100, 6);
    expect(settlement.settledRedemptionPnlUsdc).toBeGreaterThan(48);
    expect(orchestrator.getPositions()).toHaveLength(0);
    const reconSummary = orchestrator.getReconciliationSummary();
    expect(reconSummary.unexplainedDriftUsdc).toBe(0);
    expect(reconSummary.positionsByToken['token-yes-runtime-v4'] ?? 0).toBe(0);
    const redemptionEvents = await orchestrator.getJournal().loadEventsByType('market_redemption');
    expect(redemptionEvents.length).toBeGreaterThanOrEqual(1);
    await orchestrator.stop();
  });

  it('syncs PolymarketSettlementListener with PolymarketOrderReconciler on market resolution', () => {
    const reconciler = new PolymarketOrderReconciler(5_000);
    const now = Date.now();
    reconciler.createOrder({
      intentId: 'intent-settle-1', orderId: 'ord-settle-1', marketId: 'cond-settle-1',
      tokenId: 'tok-settle-1', side: 'BUY', requestedSize: 50, limitPrice: 0.40, timestamp: now,
    });
    reconciler.applyEvent({
      eventId: 'evt-settle-1', orderId: 'ord-settle-1', type: 'FILLED',
      fillSize: 50, fillPrice: 0.40, feeUsdc: 0, timestamp: now + 1,
    });

    const listener = new PolymarketSettlementListener({ reconciler });
    listener.trackPosition({
      positionId: 'pos-settle-1', conditionId: 'cond-settle-1', tokenId: 'tok-settle-1',
      outcomeIndex: 0, entryPrice: 0.40, size: 50,
    });
    const events = listener.handleMarketResolved({
      conditionId: 'cond-settle-1', winningOutcomeIndex: 0, winningTokenId: 'tok-settle-1',
      payoutNumerators: [1, 0], payoutDenominator: 1, timestamp: now + 2,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.realizedPnlUsd).toBeCloseTo(30, 6);
    const summary = reconciler.reconcile();
    expect(summary.fifoLedger?.settledRedemptionPnlMicro).toBe(30_000_000);
    expect(summary.unexplainedDriftUsdc).toBe(0);
    expect(summary.positionsByToken['tok-settle-1'] ?? 0).toBe(0);
  });

  it('tracks 5-level OFI, rolling VPIN, and consecutiveBookErrors dynamically and blocks toxic or broken-book orders', async () => {
    const orchestrator = new LiveTradingOrchestrator({
      capitalUsdc: 10_000, paperTrading: true, maxPositionFraction: 0.25,
    });
    await orchestrator.start();

    const snap1 = orchestrator.recordOrderBookSnapshot('tok-micro-1', {
      bids: [{ price: '0.50', size: '200' }, { price: '0.49', size: '100' }],
      asks: [{ price: '0.52', size: '200' }, { price: '0.53', size: '100' }],
    });
    expect(snap1.ofiSignedMicro).toBe(0);

    const snap2 = orchestrator.recordOrderBookSnapshot('tok-micro-1', {
      bids: [{ price: '0.51', size: '350' }, { price: '0.50', size: '150' }],
      asks: [{ price: '0.52', size: '100' }, { price: '0.53', size: '100' }],
    });
    expect(snap2.totalOfiLevelsActive).toBeGreaterThanOrEqual(2);
    expect(snap2.ofiSignedMicro).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      orchestrator.recordTradePrint('tok-micro-1', {
        makerAssetId: '0', sharesMicro: 200_000_000, notionalUsdMicro: 100_000_000,
      });
    }
    const telemetry = orchestrator.getMicrostructureTelemetry('tok-micro-1');
    expect(telemetry.currentVpin).toBeGreaterThan(0.70);
    expect(telemetry.regime.state).toBe(3);
    expect(telemetry.regime.isToxicKillSwitchTriggered).toBe(true);

    await expect(
      orchestrator.placeOrder(makeOrder({ tokenId: 'tok-micro-1', size: 10, price: 0.50 })),
    ).rejects.toThrow(/VPIN_TOXICITY_EXCEEDED/);

    let shouldFailBook = true;
    orchestrator.setPaperOrderBookProvider(async () => {
      if (shouldFailBook) throw new Error('CLOB_TIMEOUT');
      return { bids: [{ price: '0.49', size: '500' }], asks: [{ price: '0.50', size: '500' }] };
    });

    for (let i = 0; i < 3; i++) {
      const res = await orchestrator.placeOrder(makeOrder({ tokenId: 'tok-book-err', size: 10, price: 0.50 }));
      expect(res.status).toBe('unmatched');
    }
    expect(orchestrator.getMicrostructureTelemetry('tok-book-err').consecutiveBookErrors).toBe(3);

    await expect(
      orchestrator.placeOrder(makeOrder({ tokenId: 'tok-book-err', size: 10, price: 0.50 })),
    ).rejects.toThrow(/BOOK_ERROR_CIRCUIT_BREAKER/);

    shouldFailBook = false;
    orchestrator.recordOrderBookSnapshot('tok-book-err', {
      bids: [{ price: '0.49', size: '500' }], asks: [{ price: '0.50', size: '500' }],
    });
    expect(orchestrator.getMicrostructureTelemetry('tok-book-err').consecutiveBookErrors).toBe(0);

    const recovered = await orchestrator.placeOrder(makeOrder({ tokenId: 'tok-book-err', size: 10, price: 0.50 }));
    expect(recovered.status).toBe('matched');
    await orchestrator.stop();
  });

  it('forwards dynamic VPIN and consecutiveBookErrors into LiveOrderManager.submitSignal', async () => {
    const adapter = {
      placeOrder: async () => ({ orderID: 'live-1', status: 'matched' as const }),
      getOrder: async () => ({ status: 'matched' }),
      cancelOrder: async () => undefined,
      getFeeRate: async () => ({ feeRateBps: 200 }),
    } as unknown as PolymarketAdapter;
    const tracker = new LivePositionTracker(10_000);
    const gate = new PolymarketV2PreTradeRiskGate({ maxMarketExposureMicro: 10_000_000_000, maxConsecutiveBookErrors: 3 });
    const manager = new LiveOrderManager(
      adapter, tracker, 60_000, undefined, gate, () => 10_000,
      (tokenId) => (tokenId === 'tok-toxic'
        ? { currentVpin: 0.85, consecutiveBookErrors: 0 }
        : { currentVpin: 0.2, consecutiveBookErrors: 3 }),
    );

    await expect(
      manager.submitSignal(
        { tokenId: 'tok-toxic', side: 'BUY', price: 0.50, size: 10, confidence: 0.8, reason: 'test', timestamp: Date.now() },
        'strat-v4',
      ),
    ).rejects.toThrow(/VPIN_TOXICITY_EXCEEDED/);

    await expect(
      manager.submitSignal(
        { tokenId: 'tok-broken-book', side: 'BUY', price: 0.50, size: 10, confidence: 0.8, reason: 'test', timestamp: Date.now() },
        'strat-v4',
      ),
    ).rejects.toThrow(/BOOK_ERROR_CIRCUIT_BREAKER/);
  });
});
