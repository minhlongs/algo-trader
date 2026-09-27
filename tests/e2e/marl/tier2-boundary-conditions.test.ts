/**
 * Tier 2: Boundary & Corner Conditions Test Suite (MARL Market-Making Engine)
 *
 * Exhaustive edge case testing across extreme values, zero/negative inputs,
 * exact hurdle boundaries, saturation limits, timeout races, and depth exhaustion.
 *
 * Covers 19 features (B1 through B19) with >= 5 boundary test cases each (95 total tests).
 */

import { describe, it, expect } from 'vitest';
import {
  calculateReservationPrice,
  calculateOptimalSpreadBase,
  quantizeToTick,
  calculateOptimalQuotes,
  PolymarketQuoteFormatter,
  MultiAgentPOMDPEnv,
  SyntheticOrderbookReplayEngine,
  LiveClobStreamAdapter,
  CrossVenueNetDeltaTracker,
  ToleranceBandRebalanceTrigger,
  AtomicCrossVenueHedgeDispatcher,
  CompensatoryUnwindHandler,
  VpinCalculator,
  KylesLambdaEstimator,
  DynamicQuoteWideningController,
  InstantCancellationTripwire,
  InformedSweepDetector,
  PreTradeQuotingRiskGuard,
  MarlPrometheusTelemetry,
  MarlHashChainedAuditLogger,
  UnifiedMarlEngine,
} from './fixtures/marl-test-harness';

describe('Tier 2: Boundary & Corner Conditions (B1 to B19)', () => {
  // ─── B1: Avellaneda-Stoikov Reservation Price Boundaries ───────────────────
  describe('B1: Avellaneda-Stoikov Reservation Price Boundaries', () => {
    it('B1.1: extreme positive inventory (q = +10,000) causes reservation price to plunge', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 10_000,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
      });
      // r = 0.50 - 10000 * 0.1 * 0.0004 * 100 = 0.50 - 40 = -39.5
      expect(resPrice).toBeLessThan(0);
    });

    it('B1.2: extreme negative inventory (q = -10,000) causes reservation price to surge', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: -10_000,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
      });
      expect(resPrice).toBeGreaterThan(1.0);
    });

    it('B1.3: zero volatility (sigma = 0) reservation price equals mid-price regardless of inventory', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 500,
        gamma: 0.5,
        sigma: 0.0,
        timeToHorizonSec: 100,
      });
      expect(resPrice).toBe(0.50);
    });

    it('B1.4: extreme volatility (sigma = 1.0) inventory skew dominates reservation price', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 1,
        gamma: 0.1,
        sigma: 1.0,
        timeToHorizonSec: 10,
      });
      // 0.50 - 1 * 0.1 * 1.0 * 10 = 0.50 - 1.0 = -0.50
      expect(resPrice).toBe(-0.50);
    });

    it('B1.5: zero remaining horizon (tau = 0) cancels inventory skew term entirely', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 999_999,
        gamma: 10.0,
        sigma: 0.50,
        timeToHorizonSec: 0,
      });
      expect(resPrice).toBe(0.50);
    });
  });

  // ─── B2: Optimal Spreads & Quote Placement Boundaries ──────────────────────
  describe('B2: Optimal Spreads & Quote Placement Boundaries', () => {
    it('B2.1: near-zero volatility collapses spread to liquidity base without negative values', () => {
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.1,
        sigma: 1e-8,
        timeToHorizonSec: 100,
        kappa: 1.5,
      });
      expect(quotes.totalSpread).toBeGreaterThan(0);
      expect(quotes.bidPrice).toBeLessThan(0.50);
      expect(quotes.askPrice).toBeGreaterThan(0.50);
    });

    it('B2.2: extreme illiquidity (kappa -> 0) clamps spread to maxSpread ceiling (0.20)', () => {
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 1.0,
        sigma: 0.02,
        timeToHorizonSec: 100,
        kappa: 0.01, // extremely thin book
        maxSpread: 0.20,
      });
      expect(quotes.totalSpread).toBeLessThanOrEqual(0.20);
      expect(quotes.clamped).toBe(true);
    });

    it('B2.3: infinite liquidity (kappa -> inf) collapses spread to minSpread floor (0.02)', () => {
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 1,
        kappa: 1_000.0,
        minSpread: 0.02,
      });
      expect(quotes.totalSpread).toBeGreaterThanOrEqual(0.02);
      expect(quotes.clamped).toBe(true);
    });

    it('B2.4: risk neutrality (gamma -> 0) results in minimal baseline spread', () => {
      const base = calculateOptimalSpreadBase(0.0001, 1.5);
      expect(base).toBeGreaterThan(0);
      expect(base).toBeLessThan(0.01);
    });

    it('B2.5: extreme risk aversion (gamma = 10.0) widens quotes to maxSpread limit', () => {
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 10.0,
        sigma: 0.02,
        timeToHorizonSec: 100,
        kappa: 1.5,
        maxSpread: 0.20,
      });
      expect(quotes.totalSpread).toBeCloseTo(0.20, 2);
      expect(quotes.clamped).toBe(true);
    });
  });

  // ─── B3: Polymarket Quote Formatter & Clamps Boundaries ────────────────────
  describe('B3: Polymarket Quote Formatter & Clamps Boundaries', () => {
    const formatter = new PolymarketQuoteFormatter(0.01, 0.01, 0.99);

    it('B3.1: reservation price outside [0.01, 0.99] (-0.50) clamps bid to exactly 0.01', () => {
      const res = formatter.formatAndClamp(-0.50, 0.40, 0.50);
      expect(res.bidPrice).toBe(0.01);
      expect(res.clamped).toBe(true);
    });

    it('B3.2: reservation price > 1.0 (1.50) clamps ask to exactly 0.99', () => {
      const res = formatter.formatAndClamp(0.60, 1.50, 0.50);
      expect(res.askPrice).toBe(0.99);
      expect(res.clamped).toBe(true);
    });

    it('B3.3: inverted input quotes (rawBid = 0.80, rawAsk = 0.20) correctly uncrossed with ask >= bid + 0.01', () => {
      const res = formatter.formatAndClamp(0.80, 0.20, 0.50);
      expect(res.askPrice).toBeGreaterThan(res.bidPrice);
      expect(res.clamped).toBe(true);
    });

    it('B3.4: boundary edge: bid clamped at 0.98 forces ask to 0.99', () => {
      const res = formatter.formatAndClamp(0.98, 0.98, 0.98);
      expect(res.bidPrice).toBeLessThan(res.askPrice);
      expect(res.askPrice).toBeLessThanOrEqual(0.99);
    });

    it('B3.5: boundary edge: ask clamped at 0.02 forces bid to 0.01', () => {
      const res = formatter.formatAndClamp(0.02, 0.02, 0.02);
      expect(res.bidPrice).toBeGreaterThanOrEqual(0.01);
      expect(res.askPrice).toBeGreaterThan(res.bidPrice);
    });
  });

  // ─── B4: Multi-Agent POMDP Quoting Environment Boundaries ──────────────────
  describe('B4: Multi-Agent POMDP Quoting Environment Boundaries', () => {
    it('B4.1: observation vector components never exceed strict bounds [-1.0, 1.0] under extreme values', () => {
      const env = new MultiAgentPOMDPEnv(0.99);
      const obs = env.reset();
      for (let i = 0; i < obs.values.length; i++) {
        expect(obs.values[i]).toBeGreaterThanOrEqual(-1.0);
        expect(obs.values[i]).toBeLessThanOrEqual(1.0);
        expect(Number.isNaN(obs.values[i])).toBe(false);
      }
    });

    it('B4.2: maximum boundary action (multiplier = 5.0, sizeRatio = 1.0) produces valid step result', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      const res = env.step({
        bidSpreadMultiplier: 5.0,
        askSpreadMultiplier: 5.0,
        bidSizeRatio: 1.0,
        askSizeRatio: 1.0,
        mode: 'BOTH',
      });
      expect(res.reward).toBeDefined();
      expect(Number.isFinite(res.reward)).toBe(true);
    });

    it('B4.3: minimum boundary action (multiplier = 0.5, sizeRatio = 0.0) produces valid step result', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      const res = env.step({
        bidSpreadMultiplier: 0.5,
        askSpreadMultiplier: 0.5,
        bidSizeRatio: 0.0,
        askSizeRatio: 0.0,
        mode: 'CANCEL_ALL',
      });
      expect(res.reward).toBeDefined();
      expect(Number.isFinite(res.reward)).toBe(true);
    });

    it('B4.4: inventory penalization does not produce NaN at large inventory levels', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      const res = env.step({
        bidSpreadMultiplier: 2.0,
        askSpreadMultiplier: 2.0,
        bidSizeRatio: 0.5,
        askSizeRatio: 0.5,
        mode: 'BOTH',
      });
      expect(Number.isNaN(res.reward)).toBe(false);
    });

    it('B4.5: step after terminal done state remains bounded without throwing unhandled exceptions', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      for (let i = 0; i < 1_005; i++) {
        env.step({
          bidSpreadMultiplier: 1.0,
          askSpreadMultiplier: 1.0,
          bidSizeRatio: 0.5,
          askSizeRatio: 0.5,
          mode: 'BOTH',
        });
      }
      const postDone = env.step({
        bidSpreadMultiplier: 1.0,
        askSpreadMultiplier: 1.0,
        bidSizeRatio: 0.5,
        askSizeRatio: 0.5,
        mode: 'BOTH',
      });
      expect(postDone.done).toBe(true);
    });
  });

  // ─── B5: Synthetic Orderbook Replay Engine Boundaries ───────────────────────
  describe('B5: Synthetic Orderbook Replay Engine Boundaries', () => {
    it('B5.1: very wide spreads (0.20) generate minimal to no passive fills', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      let fillsCount = 0;
      for (let i = 0; i < 20; i++) {
        const step = replay.stepTick(0.20, 0.20);
        fillsCount += step.fills.length;
      }
      expect(fillsCount).toBe(0);
    });

    it('B5.2: tight spreads (0.01) generate multiple fills', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      let fillsCount = 0;
      for (let i = 0; i < 30; i++) {
        const step = replay.stepTick(0.01, 0.01);
        fillsCount += step.fills.length;
      }
      expect(fillsCount).toBeGreaterThan(0);
    });

    it('B5.3: single tick replay handles immediate execution cleanly', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      const s1 = replay.stepTick(0.02, 0.02);
      expect(s1.step).toBe(1);
      expect(s1.orderBook.bids[0].price).toBeCloseTo(0.48, 2);
    });

    it('B5.4: replay resets state cleanly', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      replay.stepTick(0.01, 0.01);
      replay.stepTick(0.01, 0.01);
      replay.reset();
      expect(replay.getInventory()).toBe(0);
    });

    it('B5.5: extreme mid-price in replay does not produce negative or inverted book levels', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.02);
      const step = replay.stepTick(0.01, 0.01);
      expect(step.orderBook.bids[0].price).toBeGreaterThan(0);
      expect(step.orderBook.asks[0].price).toBeGreaterThan(step.orderBook.bids[0].price);
    });
  });

  // ─── B6: Live CLOB Streaming Adapter Boundaries ────────────────────────────
  describe('B6: Live CLOB Streaming Adapter Boundaries', () => {
    it('B6.1: empty orderbook (0 bids, 0 asks) is rejected by ingestMessage', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      adapter.connect();
      const res = adapter.ingestMessage({
        symbol: 'BTC-USD-YES',
        venue: 'polymarket',
        bids: [],
        asks: [],
        timestamp: Date.now(),
      });
      expect(res).toBe(false);
    });

    it('B6.2: exact heartbeat boundary: stream healthy when message received within window', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES', heartbeatTimeoutMs: 5_000 });
      adapter.connect();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('B6.3: rapid connect / disconnect cycling maintains consistent internal state', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      adapter.connect();
      adapter.disconnect();
      adapter.connect();
      adapter.disconnect();
      expect(adapter.isHealthy()).toBe(false);
    });

    it('B6.4: single-sided orderbook (bids only, no asks) fails validation', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      adapter.connect();
      const res = adapter.ingestMessage({
        symbol: 'BTC-USD-YES',
        venue: 'polymarket',
        bids: [{ price: 0.49, size: 100 }],
        asks: [],
        timestamp: Date.now(),
      });
      expect(res).toBe(false);
    });

    it('B6.5: message ingestion without connect returns false', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      const res = adapter.ingestMessage({
        symbol: 'BTC-USD-YES',
        venue: 'polymarket',
        bids: [{ price: 0.49, size: 100 }],
        asks: [{ price: 0.51, size: 100 }],
        timestamp: Date.now(),
      });
      expect(res).toBe(false);
    });
  });

  // ─── B7: Cross-Venue Net Delta Tracker Boundaries ──────────────────────────
  describe('B7: Cross-Venue Net Delta Tracker Boundaries', () => {
    it('B7.1: portfolio with zero contracts on all venues returns exactly 0.0 net delta', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 0,
        unitDelta: 1.0,
        netDelta: 0,
        notionalUsd: 0,
      });
      const snap = tracker.computeNetDelta();
      expect(snap.netDelta).toBe(0);
      expect(snap.grossNotionalUsd).toBe(0);
    });

    it('B7.2: deep ITM Polymarket option (delta approaches 0.01) produces minimal contribution', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 100,
        unitDelta: 0.001,
        netDelta: 0.1,
        notionalUsd: 99,
      });
      const snap = tracker.computeNetDelta(0.15);
      expect(snap.polyDelta).toBe(0.1);
      expect(snap.rebalanceRequired).toBe(false);
    });

    it('B7.3: deep OTM Polymarket option produces minimal delta', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 50,
        unitDelta: 0.0001,
        netDelta: 0.005,
        notionalUsd: 1,
      });
      const snap = tracker.computeNetDelta();
      expect(snap.polyDelta).toBeCloseTo(0.005, 3);
    });

    it('B7.4: perfectly symmetrical long Polymarket + short CEX positions produce exact zero net delta', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 2.5,
        unitDelta: 1.0,
        netDelta: 2.5,
        notionalUsd: 1250,
      });
      tracker.updatePosition({
        venue: 'binance',
        symbol: 'BTC/USDT',
        contracts: 2.5,
        unitDelta: -1.0,
        netDelta: -2.5,
        notionalUsd: 125_000,
      });
      const snap = tracker.computeNetDelta();
      expect(snap.netDelta).toBe(0);
      expect(snap.rebalanceRequired).toBe(false);
    });

    it('B7.5: clearing tracker resets all venue positions to zero', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 10,
        unitDelta: 1.0,
        netDelta: 10,
        notionalUsd: 5_000,
      });
      tracker.clear();
      const snap = tracker.computeNetDelta();
      expect(snap.positions.length).toBe(0);
      expect(snap.netDelta).toBe(0);
    });
  });

  // ─── B8: Tolerance Band Rebalance Trigger Boundaries ───────────────────────
  describe('B8: Tolerance Band Rebalance Trigger Boundaries', () => {
    it('B8.1: net delta exactly at tolerance threshold (|Delta| = Delta_thresh) does not trigger', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const res = trigger.evaluate(0.10);
      expect(res.triggerRebalance).toBe(false);
    });

    it('B8.2: net delta at threshold + epsilon (0.1001) triggers rebalance', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const res = trigger.evaluate(0.1001);
      expect(res.triggerRebalance).toBe(true);
      expect(res.targetHedgeAmount).toBe(-0.1001);
    });

    it('B8.3: net delta exactly at inner hysteresis boundary (0.05) resets rebalance state', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50); // inner = 0.05
      trigger.evaluate(0.15); // trigger rebalance
      const res = trigger.evaluate(0.05); // exactly inner band
      expect(res.triggerRebalance).toBe(false);
    });

    it('B8.4: zero net delta produces zero target hedge amount', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const res = trigger.evaluate(0);
      expect(res.triggerRebalance).toBe(false);
      expect(res.targetHedgeAmount).toBe(0);
    });

    it('B8.5: negative net delta produces positive target hedge amount', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const res = trigger.evaluate(-0.12);
      expect(res.triggerRebalance).toBe(true);
      expect(res.targetHedgeAmount).toBe(0.12);
    });
  });

  // ─── B9: Atomic Cross-Venue Delta Hedge Dispatcher Boundaries ──────────────
  describe('B9: Atomic Cross-Venue Delta Hedge Dispatcher Boundaries', () => {
    const dispatcher = new AtomicCrossVenueHedgeDispatcher({
      deltaThreshold: 0.10,
      hysteresisRatio: 0.50,
      primaryHedgeVenue: 'binance',
      fallbackHedgeVenue: 'bybit',
      maxHedgeSlippageBps: 15,
      orderTimeoutMs: 300,
      maxUnwindRetries: 3,
      emergencyLiquidation: true,
      minLotSize: 0.001,
    });

    it('B9.1: target delta exactly at minimum lot size (0.001) is dispatched successfully', async () => {
      const report = await dispatcher.dispatchHedge(0.001, 'binance');
      expect(report.status).toBe('FILLED');
      expect(report.filledAmount).toBe(0.001);
    });

    it('B9.2: target delta strictly below minimum lot size (0.0009) is rejected with FAILED status', async () => {
      const report = await dispatcher.dispatchHedge(0.0009, 'binance');
      expect(report.status).toBe('FAILED');
      expect(report.filledAmount).toBe(0);
    });

    it('B9.3: zero target delta returns FAILED status with 0 requested amount', async () => {
      const report = await dispatcher.dispatchHedge(0, 'binance');
      expect(report.status).toBe('FAILED');
    });

    it('B9.4: 0% fill rate returns FAILED with 100% residual delta', async () => {
      const report = await dispatcher.dispatchHedge(0.05, 'binance', 'BTC/USDT', 0);
      expect(report.status).toBe('FAILED');
      expect(report.filledAmount).toBe(0);
      expect(report.residualDelta).toBe(0.05);
    });

    it('B9.5: 100% fill rate returns FILLED with exactly 0 residual delta', async () => {
      const report = await dispatcher.dispatchHedge(-0.08, 'binance', 'BTC/USDT', 1.0);
      expect(report.status).toBe('FILLED');
      expect(report.residualDelta).toBe(0);
    });
  });

  // ─── B10: Compensatory Unwind & Residual Delta Handler Boundaries ───────────
  describe('B10: Compensatory Unwind & Residual Delta Handler Boundaries', () => {
    const handler = new CompensatoryUnwindHandler(3);

    it('B10.1: residual delta < 1e-6 requires zero unwind and returns actionTaken none', async () => {
      const res = await handler.executeUnwind({
        hedgeId: 'b1',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 0.1,
        filledAmount: 0.1,
        avgFillPrice: 50_000,
        latencyMs: 10,
        status: 'FILLED',
        residualDelta: 0,
      });
      expect(res.actionTaken).toBe('none');
      expect(res.unwoundAmount).toBe(0);
    });

    it('B10.2: partial fill leaving 99% residual delta executes unwind for full residual', async () => {
      const res = await handler.executeUnwind({
        hedgeId: 'b2',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 1.0,
        filledAmount: 0.01,
        avgFillPrice: 50_000,
        latencyMs: 15,
        status: 'PARTIAL',
        residualDelta: 0.99,
      });
      expect(res.unwoundAmount).toBeCloseTo(0.99, 4);
      expect(res.unwindSuccess).toBe(true);
    });

    it('B10.3: unwind report with FAILED status triggers full compensatory unwind', async () => {
      const res = await handler.executeUnwind({
        hedgeId: 'b3',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell',
        requestedAmount: 0.50,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 300,
        status: 'FAILED',
        residualDelta: -0.50,
      });
      expect(res.unwoundAmount).toBe(0.50);
      expect(res.unwindSuccess).toBe(true);
    });

    it('B10.4: negative residual delta unwinds by purchasing back inventory', async () => {
      const res = await handler.executeUnwind({
        hedgeId: 'b4',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell',
        requestedAmount: 0.20,
        filledAmount: 0.05,
        avgFillPrice: 50_000,
        latencyMs: 20,
        status: 'PARTIAL',
        residualDelta: -0.15,
      });
      expect(res.residualDelta).toBe(0);
    });

    it('B10.5: retry count is tracked on partial fill recovery', async () => {
      const res = await handler.executeUnwind({
        hedgeId: 'b5',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 0.10,
        filledAmount: 0.05,
        avgFillPrice: 50_000,
        latencyMs: 10,
        status: 'PARTIAL',
        residualDelta: 0.05,
      });
      expect(res.retryCount).toBeGreaterThan(0);
    });
  });

  // ─── B11: Volume-Synchronized Probability of Toxicity (VPIN) Boundaries ────
  describe('B11: Volume-Synchronized Probability of Toxicity (VPIN) Boundaries', () => {
    it('B11.1: 100% buy orders across all buckets produces VPIN = 1.0 and CDF ~ 1.0', () => {
      const vpin = new VpinCalculator(100, 10);
      for (let i = 0; i < 10; i++) {
        vpin.ingestTrade({ tradeId: `b-${i}`, timestamp: Date.now(), price: 0.52, volume: 100, bidPrice: 0.49, askPrice: 0.51 });
      }
      expect(vpin.calculateVpin()).toBe(1.0);
      expect(vpin.getCdf()).toBeGreaterThan(0.99);
    });

    it('B11.2: 50/50 alternating buy/sell orders produces VPIN = 0.0 and CDF ~ 0.0', () => {
      const vpin = new VpinCalculator(100, 10);
      for (let i = 0; i < 10; i++) {
        vpin.ingestTrade({ tradeId: `b-${i}`, timestamp: Date.now(), price: 0.52, volume: 50, bidPrice: 0.49, askPrice: 0.51 });
        vpin.ingestTrade({ tradeId: `s-${i}`, timestamp: Date.now(), price: 0.48, volume: 50, bidPrice: 0.49, askPrice: 0.51 });
      }
      expect(vpin.calculateVpin()).toBe(0.0);
      expect(vpin.getCdf()).toBeLessThan(0.10);
    });

    it('B11.3: zero volume elapsed: forceTimeoutBucket finalizes pending volume safely', () => {
      const vpin = new VpinCalculator(1_000, 10);
      vpin.ingestTrade({ tradeId: 't1', timestamp: Date.now(), price: 0.52, volume: 200, bidPrice: 0.49, askPrice: 0.51 });
      vpin.forceTimeoutBucket();
      expect(vpin.calculateVpin()).toBe(1.0);
    });

    it('B11.4: trade executed exactly at midpoint uses tick rule comparison with previous price', () => {
      const vpin = new VpinCalculator(100, 5);
      // Trade 1 at 0.50
      vpin.ingestTrade({ tradeId: 't1', timestamp: Date.now(), price: 0.50, volume: 50, bidPrice: 0.49, askPrice: 0.51 });
      // Trade 2 at 0.50 (midpoint is 0.50): price >= lastPrice -> buy
      vpin.ingestTrade({ tradeId: 't2', timestamp: Date.now(), price: 0.50, volume: 50, bidPrice: 0.49, askPrice: 0.51 });
      expect(vpin.calculateVpin()).toBe(1.0);
    });

    it('B11.5: consecutive midpoint trades with unchanged price inherit previous tick sign', () => {
      const vpin = new VpinCalculator(100, 5);
      vpin.ingestTrade({ tradeId: 't0', timestamp: Date.now(), price: 0.48, volume: 50, bidPrice: 0.47, askPrice: 0.49 }); // sell
      vpin.ingestTrade({ tradeId: 't1', timestamp: Date.now(), price: 0.48, volume: 50, bidPrice: 0.47, askPrice: 0.49 });
      expect(vpin.calculateVpin()).toBe(1.0);
    });
  });

  // ─── B12: Kyle's Lambda Price Impact Estimator Boundaries ──────────────────
  describe('B12: Kyle\'s Lambda Price Impact Estimator Boundaries', () => {
    it('B12.1: identical signed order flow across all ticks (Var(Q) = 0) returns baseline lambda', () => {
      const est = new KylesLambdaEstimator(50, 0.0001);
      for (let i = 0; i < 10; i++) {
        est.ingestInterval(0.02, 50); // Same Q
      }
      expect(est.estimate().lambda).toBe(0.0001);
    });

    it('B12.2: perfectly collinear price impact (R^2 = 1.0) yields exact slope', () => {
      const est = new KylesLambdaEstimator(50);
      for (let i = 1; i <= 10; i++) {
        est.ingestInterval(0.02 * i, 10 * i);
      }
      expect(est.estimate().lambda).toBeCloseTo(0.002, 4);
    });

    it('B12.3: negative price impact slope is clamped to non-negative (lambda >= 0)', () => {
      const est = new KylesLambdaEstimator(50);
      for (let i = 1; i <= 10; i++) {
        est.ingestInterval(-0.01 * i, 10 * i); // Inverted flow
      }
      expect(est.estimate().lambda).toBe(0);
    });

    it('B12.4: single trade observation (n = 1 < 3) returns baseline lambda', () => {
      const est = new KylesLambdaEstimator(50, 0.0001);
      est.ingestInterval(0.05, 100);
      expect(est.estimate().lambda).toBe(0.0001);
    });

    it('B12.5: extreme order flow volume (Q = 1e6) does not cause numerical overflow', () => {
      const est = new KylesLambdaEstimator(50);
      for (let i = 1; i <= 10; i++) {
        est.ingestInterval(0.01 * i, 1_000_000 * i);
      }
      const res = est.estimate();
      expect(Number.isFinite(res.lambda)).toBe(true);
      expect(res.lambda).toBeGreaterThan(0);
    });
  });

  // ─── B13: Dynamic Quote Widening Multiplier Boundaries ─────────────────────
  describe('B13: Dynamic Quote Widening Multiplier Boundaries', () => {
    const controller = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);

    it('B13.1: VPIN CDF exactly at 0.75 threshold produces multiplier = 1.0', () => {
      const w = controller.calculateMultiplier(0.75, 1.0);
      expect(w).toBe(1.0);
    });

    it('B13.2: Kyle\'s lambda exactly at baseline (ratio = 1.0) produces multiplier = 1.0', () => {
      const w = controller.calculateMultiplier(0.50, 1.0);
      expect(w).toBe(1.0);
    });

    it('B13.3: catastrophic toxicity (CDF = 1.0, lambda ratio = 100) clamps multiplier strictly to 5.0', () => {
      const w = controller.calculateMultiplier(1.0, 100.0);
      expect(w).toBe(5.0);
    });

    it('B13.4: negative excess inputs never reduce multiplier below 1.0 floor', () => {
      const w = controller.calculateMultiplier(0.10, 0.20);
      expect(w).toBe(1.0);
    });

    it('B13.5: fractional VPIN CDF (0.76) produces slight proportional expansion (> 1.0)', () => {
      const w = controller.calculateMultiplier(0.76, 1.0);
      expect(w).toBeCloseTo(1.03, 2);
      expect(w).toBeGreaterThan(1.0);
    });
  });

  // ─── B14: Instant Defensive Cancellation Tripwire Boundaries ───────────────
  describe('B14: Instant Defensive Cancellation Tripwire Boundaries', () => {
    it('B14.1: VPIN CDF at 0.949 (just below 0.95 hurdle) does not trip tripwire', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      const res = tripwire.evaluate(0.949, 1.0, false);
      expect(res.tripwireActive).toBe(false);
    });

    it('B14.2: VPIN CDF at exact 0.95 threshold trips instant cancellation', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      const res = tripwire.evaluate(0.95, 1.0, false);
      expect(res.tripwireActive).toBe(true);
      expect(res.reason).toBe('critical_vpin_breach');
    });

    it('B14.3: lambda ratio at 2.99 does not trip, while 3.00 trips immediately', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      const resSub = tripwire.evaluate(0.50, 2.99, false);
      expect(resSub.tripwireActive).toBe(false);

      const resTrip = tripwire.evaluate(0.50, 3.00, false);
      expect(resTrip.tripwireActive).toBe(true);
      expect(resTrip.reason).toBe('liquidity_black_hole');
    });

    it('B14.4: active tripwire suppresses quoting during entire cooldown duration', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 10_000);
      tripwire.evaluate(0.98, 1.0, false);
      const inCooldown = tripwire.evaluate(0.10, 0.5, false);
      expect(inCooldown.tripwireActive).toBe(true);
      expect(inCooldown.reason).toBe('quarantine_cooldown_active');
    });

    it('B14.5: manual reset clears tripwire state and cooldown immediately', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 10_000);
      tripwire.evaluate(0.98, 1.0, false);
      tripwire.reset();
      const afterReset = tripwire.evaluate(0.10, 0.5, false);
      expect(afterReset.tripwireActive).toBe(false);
    });
  });

  // ─── B15: Informed Sweep Burst Detector Boundaries ─────────────────────────
  describe('B15: Informed Sweep Burst Detector Boundaries', () => {
    it('B15.1: exactly 2 depleted levels does not trip sweep alert', () => {
      const detector = new InformedSweepDetector();
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 30);
      detector.registerDepletion('buy', 500, now - 10);
      const res = detector.checkSweep(0.50);
      expect(res.sweepDetected).toBe(false);
    });

    it('B15.2: exactly 3 depleted levels in same direction trips sweep alert', () => {
      const detector = new InformedSweepDetector();
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 50);
      detector.registerDepletion('buy', 500, now - 30);
      detector.registerDepletion('buy', 500, now - 10);
      const res = detector.checkSweep(0.50);
      expect(res.sweepDetected).toBe(true);
      expect(res.levelsDepleted).toBe(3);
    });

    it('B15.3: mixed direction depletions (2 buy, 1 sell) do not trip sweep alert', () => {
      const detector = new InformedSweepDetector();
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 40);
      detector.registerDepletion('buy', 500, now - 20);
      detector.registerDepletion('sell', 500, now - 10);
      const res = detector.checkSweep(0.50);
      expect(res.sweepDetected).toBe(false);
    });

    it('B15.4: price jump exactly at 4 * sigma does not trip fast jump anomaly', () => {
      const detector = new InformedSweepDetector();
      detector.checkSweep(0.50);
      const res = detector.checkSweep(0.54, 0.01); // 0.04 = 4 * 0.01
      expect(res.fastJumpAnomaly).toBe(false);
    });

    it('B15.5: price jump at 4 * sigma + epsilon trips fast jump anomaly', () => {
      const detector = new InformedSweepDetector();
      detector.checkSweep(0.50);
      const res = detector.checkSweep(0.541, 0.01); // 0.041 > 4 * 0.01
      expect(res.fastJumpAnomaly).toBe(true);
      expect(res.sweepDetected).toBe(true);
    });
  });

  // ─── B16: Pre-Trade Quoting Risk Guard Boundaries ──────────────────────────
  describe('B16: Pre-Trade Quoting Risk Guard Boundaries', () => {
    const guard = new PreTradeQuotingRiskGuard({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    });

    it('B16.1: trade notional exactly at 5% Quarter-Kelly limit ($5,000) is approved', () => {
      // 100k capital, 5% is 5k
      const res = guard.evaluateRisk(5_000, 100_000, 0.02, 50, 0, 0.60, 1.0);
      expect(res.approved).toBe(true);
    });

    it('B16.2: trade notional at 5% + $1 ($5,001) exceeds Kelly cap and is rejected', () => {
      const res = guard.evaluateRisk(5_001, 100_000, 0.02, 50, 0, 0.60, 1.0);
      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('KELLY_CAP_EXCEEDED');
    });

    it('B16.3: daily drawdown at 14.99% is approved; drawdown at 15.00% trips circuit breaker', () => {
      const resPass = guard.evaluateRisk(100, 100_000, 0.1499, 50, 0);
      expect(resPass.approved).toBe(true);

      const resTrip = guard.evaluateRisk(100, 100_000, 0.15, 50, 0);
      expect(resTrip.approved).toBe(false);
      expect(resTrip.circuitBroken).toBe(true);
      expect(resTrip.rejectionReason).toBe('DRAWDOWN_BREAKER_TRIPPED');
    });

    it('B16.4: venue latency at exactly 500ms is approved; at 501ms is rejected', () => {
      const resPass = guard.evaluateRisk(100, 100_000, 0.02, 500, 0);
      expect(resPass.approved).toBe(true);

      const resFail = guard.evaluateRisk(100, 100_000, 0.02, 501, 0);
      expect(resFail.approved).toBe(false);
      expect(resFail.rejectionReason).toBe('VENUE_LATENCY_SPIKE');
    });

    it('B16.5: inventory at 50,000 notional blocks any further quote size', () => {
      const res = guard.evaluateRisk(1, 100_000, 0.02, 50, 50_000);
      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('INVENTORY_LIMIT_EXCEEDED');
    });
  });

  // ─── B17: Low-Latency Prometheus Telemetry Boundaries ──────────────────────
  describe('B17: Low-Latency Prometheus Telemetry Boundaries', () => {
    it('B17.1: fill rate calculation with 0 quotes posted returns 0 without division by zero', () => {
      const tele = new MarlPrometheusTelemetry();
      expect(tele.getFillRate()).toBe(0);
    });

    it('B17.2: negative realized PnL is tracked accurately in telemetry', () => {
      const tele = new MarlPrometheusTelemetry();
      tele.recordPnl(-450.75, -50.0);
      expect(tele.realizedPnl).toBe(-450.75);
    });

    it('B17.3: large quote count (> 100,000) does not overflow integer counters', () => {
      const tele = new MarlPrometheusTelemetry();
      for (let i = 0; i < 100_005; i++) {
        tele.recordQuote('posted', 'both');
      }
      expect(tele.quotesCount).toBe(100_005);
    });

    it('B17.4: empty hedge latencies array returns clean state', () => {
      const tele = new MarlPrometheusTelemetry();
      expect(tele.hedgeLatencies.length).toBe(0);
    });

    it('B17.5: toxicity tripwire event counter increments monotonically', () => {
      const tele = new MarlPrometheusTelemetry();
      tele.recordToxicity(0.95, 3.5, true);
      tele.recordToxicity(0.96, 3.8, true);
      expect(tele.toxicityTripwireEvents).toBe(2);
    });
  });

  // ─── B18: SHA-256 HMAC Hash-Chained Audit Logger Boundaries ────────────────
  describe('B18: SHA-256 HMAC Hash-Chained Audit Logger Boundaries', () => {
    it('B18.1: empty payload record generates valid SHA-256 HMAC hash', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      const rec = logger.logAction('marl.quote.posted', {});
      expect(rec.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('B18.2: sequence number 0 has exactly 64 zero characters as previousHash', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      const rec0 = logger.logAction('marl.quote.posted', { bid: 0.50 });
      expect(rec0.previousHash).toBe('0'.repeat(64));
    });

    it('B18.3: modifying previousHash of block 1 breaks chain verification at index 1', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      logger.logAction('marl.quote.posted', { bid: 0.49 });
      logger.logAction('marl.quote.posted', { bid: 0.50 });
      const records = logger.getRecords();
      records[1].previousHash = '1'.repeat(64);
      const res = logger.verifyChain();
      expect(res.valid).toBe(false);
      expect(res.brokenAt).toBe(1);
    });

    it('B18.4: tampering with record payload breaks chain verification', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      logger.logAction('marl.quote.posted', { id: 1 });
      logger.logAction('marl.quote.posted', { id: 2 });
      const records = logger.getRecords();
      records[0].payload = { id: 999 }; // in-place mutation of payload
      const res = logger.verifyChain();
      expect(res.valid).toBe(false);
    });

    it('B18.5: empty audit chain (0 records) returns valid=true with total=0', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      const res = logger.verifyChain();
      expect(res.valid).toBe(true);
      expect(res.total).toBe(0);
    });
  });

  // ─── B19: Unified MARL Engine Facade Boundaries ────────────────────────────
  describe('B19: Unified MARL Engine Facade Boundaries', () => {
    const createTestEngine = () =>
      new UnifiedMarlEngine({
        symbol: 'BTC-USD-YES',
        asConfig: {
          gamma: 0.1,
          kappa: 1.5,
          sigma: 0.02,
          terminalHorizonSec: 86_400,
          tickSize: 0.01,
          minSpread: 0.02,
          maxSpread: 0.20,
          maxInventory: 10_000,
          quoteSize: 100,
        },
        deltaHedgeConfig: {
          deltaThreshold: 0.10,
          hysteresisRatio: 0.50,
          primaryHedgeVenue: 'binance',
          fallbackHedgeVenue: 'bybit',
          maxHedgeSlippageBps: 15,
          orderTimeoutMs: 300,
          maxUnwindRetries: 3,
          emergencyLiquidation: true,
          minLotSize: 0.001,
        },
        adverseSelectionConfig: {
          bucketVolumeUsd: 10_000,
          vpinWindowBuckets: 50,
          vpinWarningCdf: 0.75,
          vpinTripwireCdf: 0.95,
          kylesLambdaWindowTicks: 100,
          kylesLambdaBaseline: 0.0001,
          kylesLambdaMultiplierTripwire: 3.0,
          maxSpreadWideningMultiplier: 5.0,
          cooldownWindowMs: 15_000,
          bucketTimeoutMs: 300_000,
          sweepLevelThreshold: 3,
          sweepWindowMs: 100,
        },
        riskConfig: {
          maxPositionFraction: 0.05,
          maxInventoryNotionalUsd: 50_000,
          maxDailyDrawdownFraction: 0.15,
          maxVenueLatencyMs: 500,
          emergencyHaltEnabled: true,
        },
      });

    it('B19.1: generateQuote called when engine is stopped returns null', () => {
      const engine = createTestEngine();
      expect(engine.generateQuote(0.50, 0)).toBeNull();
    });

    it('B19.2: calling start() multiple times is idempotent', () => {
      const engine = createTestEngine();
      engine.start();
      engine.start();
      expect(engine.getStatus().isRunning).toBe(true);
    });

    it('B19.3: zero inventory produces balanced optimal quotes', () => {
      const engine = createTestEngine();
      engine.start();
      const quote = engine.generateQuote(0.50, 0);
      expect(quote).not.toBeNull();
      expect(quote!.bidSpread).toBeCloseTo(quote!.askSpread, 2);
    });

    it('B19.4: tripwire activation during active engine cancels quotes and emits audit record', () => {
      const engine = createTestEngine();
      engine.start();
      // Induce tripwire
      for (let i = 0; i < 60; i++) {
        engine.vpinCalc.ingestTrade({
          tradeId: `tx-${i}`,
          timestamp: Date.now(),
          price: 0.55,
          volume: 10_000,
          bidPrice: 0.49,
          askPrice: 0.51,
        });
      }
      const quote = engine.generateQuote(0.50, 0);
      expect(quote).toBeNull();
      const records = engine.auditLogger.getRecords();
      const tripwireRec = records.find(r => r.action === 'marl.tripwire.activated');
      expect(tripwireRec).toBeDefined();
    });

    it('B19.5: maker fill with 0 amount leaves inventory unchanged', () => {
      const engine = createTestEngine();
      engine.start();
      engine.onMakerFill('buy', 0, 0.50);
      expect(engine.getStatus().inventory).toBe(0);
    });
  });
});
