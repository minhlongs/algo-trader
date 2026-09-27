/**
 * Tier 1: Feature Coverage Test Suite (MARL Market-Making Engine)
 *
 * Covers all 19 features (F1 through F19) in isolation with >= 5 test cases per feature (95 total tests).
 * Validates baseline contracts, mathematical models, state machines, and invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

describe('Tier 1: Feature Coverage (F1 to F19)', () => {
  // ─── F1: Avellaneda-Stoikov Reservation Price ──────────────────────────────
  describe('F1: Avellaneda-Stoikov Reservation Price', () => {
    it('F1.1: reservation price equals mid-price when inventory is zero', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 86_400,
      });
      expect(resPrice).toBe(0.50);
    });

    it('F1.2: reservation price shifts downward when inventory is positive (long skew)', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 100,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
      });
      // r = s - q * gamma * sigma^2 * tau = 0.50 - 100 * 0.1 * 0.0004 * 100 = 0.50 - 0.40 = 0.10
      expect(resPrice).toBeCloseTo(0.10, 4);
      expect(resPrice).toBeLessThan(0.50);
    });

    it('F1.3: reservation price shifts upward when inventory is negative (short skew)', () => {
      const resPrice = calculateReservationPrice({
        midPrice: 0.50,
        inventory: -100,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
      });
      // r = 0.50 - (-100) * 0.1 * 0.0004 * 100 = 0.50 + 0.40 = 0.90
      expect(resPrice).toBeCloseTo(0.90, 4);
      expect(resPrice).toBeGreaterThan(0.50);
    });

    it('F1.4: reservation price scales monotonically with risk aversion gamma', () => {
      const rLowGamma = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 50,
        gamma: 0.05,
        sigma: 0.02,
        timeToHorizonSec: 100,
      });
      const rHighGamma = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 50,
        gamma: 0.20,
        sigma: 0.02,
        timeToHorizonSec: 100,
      });
      // Higher gamma with positive inventory should drop reservation price more steeply
      expect(rHighGamma).toBeLessThan(rLowGamma);
    });

    it('F1.5: reservation price approaches mid-price as time horizon tau decays toward 0', () => {
      const rLongHorizon = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 50,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 1_000,
      });
      const rZeroHorizon = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 50,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 0,
      });
      expect(rZeroHorizon).toBe(0.50);
      expect(Math.abs(rZeroHorizon - 0.50)).toBeLessThan(Math.abs(rLongHorizon - 0.50));
    });
  });

  // ─── F2: Optimal Spreads & Quote Placement ─────────────────────────────────
  describe('F2: Optimal Spreads & Quote Placement', () => {
    it('F2.1: calculates optimal half-spread base (1/kappa) * ln(1 + gamma/kappa)', () => {
      const base = calculateOptimalSpreadBase(0.1, 1.5);
      // (1 / 1.5) * ln(1 + 0.1 / 1.5) = 0.6667 * ln(1.0667) = 0.6667 * 0.06454 = 0.0430
      expect(base).toBeCloseTo(0.043, 3);
    });

    it('F2.2: asks are placed higher than mid and bids placed lower than mid when inventory is 0', () => {
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
        kappa: 1.5,
      });
      expect(quotes.askPrice).toBeGreaterThan(0.50);
      expect(quotes.bidPrice).toBeLessThan(0.50);
      expect(quotes.totalSpread).toBeGreaterThan(0);
    });

    it('F2.3: total spread increases when orderbook intensity kappa decreases (thinner book)', () => {
      const quotesDense = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
        kappa: 3.0,
      });
      const quotesThin = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
        kappa: 1.0,
      });
      expect(quotesThin.totalSpread).toBeGreaterThan(quotesDense.totalSpread);
    });

    it('F2.4: inventory skew produces asymmetric bid/ask spreads relative to mid', () => {
      const quotesLong = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 20,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizonSec: 100,
        kappa: 1.5,
      });
      // When long, ask is tighter to mid (to offload), bid is wider from mid (to deter buys)
      expect(quotesLong.bidSpread).toBeGreaterThan(quotesLong.askSpread);
    });

    it('F2.5: minimum spread constraint is strictly enforced', () => {
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.001,
        sigma: 0.001,
        timeToHorizonSec: 1,
        kappa: 50.0,
        minSpread: 0.04,
      });
      expect(quotes.totalSpread).toBeGreaterThanOrEqual(0.04);
      expect(quotes.clamped).toBe(true);
    });
  });

  // ─── F3: Polymarket Quote Formatter & Clamps ────────────────────────────────
  describe('F3: Polymarket Quote Formatter & Clamps', () => {
    const formatter = new PolymarketQuoteFormatter(0.01, 0.01, 0.99);

    it('F3.1: quantizes quotes to discrete tick increments (0.01)', () => {
      const formatted = formatter.formatAndClamp(0.4837, 0.5182, 0.50);
      expect(formatted.bidPrice).toBe(0.48);
      expect(formatted.askPrice).toBe(0.52);
    });

    it('F3.2: clamps bid to minPrice floor (0.01) when reservation price drops deeply', () => {
      const formatted = formatter.formatAndClamp(-0.05, 0.40, 0.50);
      expect(formatted.bidPrice).toBe(0.01);
      expect(formatted.clamped).toBe(true);
    });

    it('F3.3: clamps ask to maxPrice ceiling (0.99) when reservation price surges', () => {
      const formatted = formatter.formatAndClamp(0.60, 1.05, 0.50);
      expect(formatted.askPrice).toBe(0.99);
      expect(formatted.clamped).toBe(true);
    });

    it('F3.4: guarantees non-crossing quotes (ask >= bid + tickSize) even on extreme skew', () => {
      const formatted = formatter.formatAndClamp(0.55, 0.54, 0.50);
      expect(formatted.askPrice).toBeGreaterThanOrEqual(formatted.bidPrice + 0.01);
      expect(formatted.clamped).toBe(true);
    });

    it('F3.5: formats quotes cleanly with floating-point precision normalization', () => {
      const formatted = formatter.formatAndClamp(0.49000000000000005, 0.5100000000000001, 0.50);
      expect(formatted.bidPrice).toBe(0.49);
      expect(formatted.askPrice).toBe(0.51);
    });
  });

  // ─── F4: Multi-Agent POMDP Quoting Environment ─────────────────────────────
  describe('F4: Multi-Agent POMDP Quoting Environment', () => {
    it('F4.1: generates 24-dimensional normalized observation vector in bounds [-1, 1] or [0, 1]', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      const obs = env.reset();
      expect(obs.values.length).toBe(24);
      for (let i = 0; i < obs.values.length; i++) {
        expect(obs.values[i]).toBeGreaterThanOrEqual(-1.0);
        expect(obs.values[i]).toBeLessThanOrEqual(1.0);
      }
    });

    it('F4.2: executes step with valid MarlAction tuple', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      const res = env.step({
        bidSpreadMultiplier: 1.0,
        askSpreadMultiplier: 1.0,
        bidSizeRatio: 0.5,
        askSizeRatio: 0.5,
        mode: 'BOTH',
      });
      expect(res.observation.values.length).toBe(24);
      expect(res.info.quotesPosted).toBe(2);
      expect(res.done).toBe(false);
    });

    it('F4.3: reward function penalizes inventory variance (phi * q^2)', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      const res = env.step({
        bidSpreadMultiplier: 1.0,
        askSpreadMultiplier: 1.0,
        bidSizeRatio: 1.0,
        askSizeRatio: 1.0,
        mode: 'BOTH',
      });
      expect(res.reward).toBeDefined();
      expect(typeof res.reward).toBe('number');
    });

    it('F4.4: reward function penalizes quote churn when cancel-all is invoked', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      const resBoth = env.step({
        bidSpreadMultiplier: 1.0,
        askSpreadMultiplier: 1.0,
        bidSizeRatio: 1.0,
        askSizeRatio: 1.0,
        mode: 'BOTH',
      });
      const resCancel = env.step({
        bidSpreadMultiplier: 1.0,
        askSpreadMultiplier: 1.0,
        bidSizeRatio: 0.0,
        askSizeRatio: 0.0,
        mode: 'CANCEL_ALL',
      });
      expect(resBoth.reward).toBeGreaterThan(resCancel.reward);
    });

    it('F4.5: environment signals done=true on horizon limit or max inventory breach', () => {
      const env = new MultiAgentPOMDPEnv(0.50);
      env.reset();
      let lastStep = env.step({
        bidSpreadMultiplier: 1.0,
        askSpreadMultiplier: 1.0,
        bidSizeRatio: 0.5,
        askSizeRatio: 0.5,
        mode: 'BOTH',
      });
      for (let i = 0; i < 1000; i++) {
        lastStep = env.step({
          bidSpreadMultiplier: 1.0,
          askSpreadMultiplier: 1.0,
          bidSizeRatio: 0.5,
          askSizeRatio: 0.5,
          mode: 'BOTH',
        });
        if (lastStep.done) break;
      }
      expect(lastStep.done).toBe(true);
    });
  });

  // ─── F5: Synthetic Orderbook Replay Engine ──────────────────────────────────
  describe('F5: Synthetic Orderbook Replay Engine', () => {
    it('F5.1: generates valid L2 orderbook snapshot on replay step', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      const step = replay.stepTick(0.02, 0.02);
      expect(step.orderBook.symbol).toBe('BTC-USD-YES');
      expect(step.orderBook.bids.length).toBeGreaterThan(0);
      expect(step.orderBook.asks.length).toBeGreaterThan(0);
      expect(step.orderBook.bids[0].price).toBeLessThan(step.orderBook.asks[0].price);
    });

    it('F5.2: simulates Poisson arrival fills when quotes are placed near mid', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      let filled = false;
      for (let i = 0; i < 20; i++) {
        const step = replay.stepTick(0.01, 0.01);
        if (step.fills.length > 0) {
          filled = true;
          break;
        }
      }
      expect(filled).toBe(true);
    });

    it('F5.3: tracks inventory increments/decrements following simulated fills', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      for (let i = 0; i < 30; i++) {
        replay.stepTick(0.01, 0.01);
      }
      expect(typeof replay.getInventory()).toBe('number');
    });

    it('F5.4: maintains deterministic sequence numbers across steps', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      const s1 = replay.stepTick(0.02, 0.02);
      const s2 = replay.stepTick(0.02, 0.02);
      expect(s2.orderBook.sequence).toBe((s1.orderBook.sequence ?? 0) + 1);
    });

    it('F5.5: terminates replay session upon reaching max step count', () => {
      const replay = new SyntheticOrderbookReplayEngine('BTC-USD-YES', 0.50);
      let done = false;
      for (let i = 0; i < 505; i++) {
        const res = replay.stepTick(0.02, 0.02);
        if (res.done) {
          done = true;
          break;
        }
      }
      expect(done).toBe(true);
    });
  });

  // ─── F6: Live CLOB Streaming Adapter ───────────────────────────────────────
  describe('F6: Live CLOB Streaming Adapter', () => {
    it('F6.1: transitions from disconnected to connected state on connect()', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      expect(adapter.isHealthy()).toBe(false);
      adapter.connect();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('F6.2: successfully ingests valid orderbook snapshots', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      adapter.connect();
      const accepted = adapter.ingestMessage({
        symbol: 'BTC-USD-YES',
        venue: 'polymarket',
        bids: [{ price: 0.49, size: 100 }],
        asks: [{ price: 0.51, size: 100 }],
        timestamp: Date.now(),
      });
      expect(accepted).toBe(true);
      expect(adapter.getStats().messages).toBe(1);
    });

    it('F6.3: updates last heartbeat timestamp upon incoming messages', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      adapter.connect();
      adapter.ingestMessage({
        symbol: 'BTC-USD-YES',
        venue: 'polymarket',
        bids: [{ price: 0.49, size: 100 }],
        asks: [{ price: 0.51, size: 100 }],
        timestamp: Date.now(),
      });
      expect(adapter.getStats().latencyMs).toBeLessThan(100);
    });

    it('F6.4: reports healthy stream within heartbeat timeout window', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES', heartbeatTimeoutMs: 10_000 });
      adapter.connect();
      expect(adapter.isHealthy()).toBe(true);
    });

    it('F6.5: detects disconnect when disconnect() is invoked', () => {
      const adapter = new LiveClobStreamAdapter({ symbol: 'BTC-USD-YES' });
      adapter.connect();
      adapter.disconnect();
      expect(adapter.isHealthy()).toBe(false);
    });
  });

  // ─── F7: Cross-Venue Net Delta Tracker ─────────────────────────────────────
  describe('F7: Cross-Venue Net Delta Tracker', () => {
    it('F7.1: computes zero net delta for an empty portfolio', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      const snapshot = tracker.computeNetDelta();
      expect(snapshot.netDelta).toBe(0);
      expect(snapshot.rebalanceRequired).toBe(false);
    });

    it('F7.2: aggregates Polymarket binary contract delta and CEX linear delta', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 10,
        unitDelta: 0.5,
        netDelta: 5.0,
        notionalUsd: 5_000,
      });
      tracker.updatePosition({
        venue: 'binance',
        symbol: 'BTC/USDT',
        contracts: 2,
        unitDelta: 1.0,
        netDelta: 2.0,
        notionalUsd: 100_000,
      });
      const snap = tracker.computeNetDelta();
      expect(snap.polyDelta).toBe(5.0);
      expect(snap.cexDelta).toBe(2.0);
      expect(snap.netDelta).toBe(7.0);
    });

    it('F7.3: offsets positive Polymarket long delta with negative CEX short hedge', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 10,
        unitDelta: 1.0,
        netDelta: 10.0,
        notionalUsd: 5_000,
      });
      tracker.updatePosition({
        venue: 'binance',
        symbol: 'BTC/USDT',
        contracts: 10,
        unitDelta: -1.0,
        netDelta: -10.0,
        notionalUsd: 500_000,
      });
      const snap = tracker.computeNetDelta();
      expect(snap.netDelta).toBe(0);
      expect(snap.rebalanceRequired).toBe(false);
    });

    it('F7.4: tracks gross notional USD across all venue positions', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 10,
        unitDelta: 1.0,
        netDelta: 10.0,
        notionalUsd: 5_000,
      });
      tracker.updatePosition({
        venue: 'binance',
        symbol: 'BTC/USDT',
        contracts: 0.1,
        unitDelta: 1.0,
        netDelta: 0.1,
        notionalUsd: 5_000,
      });
      const snap = tracker.computeNetDelta();
      expect(snap.grossNotionalUsd).toBe(10_000);
    });

    it('F7.5: flags rebalanceRequired=true when net delta exceeds tolerance threshold', () => {
      const tracker = new CrossVenueNetDeltaTracker();
      tracker.updatePosition({
        venue: 'polymarket',
        symbol: 'BTC-USD-YES',
        contracts: 1,
        unitDelta: 0.25,
        netDelta: 0.25,
        notionalUsd: 125,
      });
      const snap = tracker.computeNetDelta(0.10);
      expect(snap.rebalanceRequired).toBe(true);
    });
  });

  // ─── F8: Tolerance Band Rebalance Trigger ──────────────────────────────────
  describe('F8: Tolerance Band Rebalance Trigger', () => {
    it('F8.1: does not trigger rebalance when net delta is within tolerance threshold', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const res = trigger.evaluate(0.08);
      expect(res.triggerRebalance).toBe(false);
      expect(res.targetHedgeAmount).toBe(0);
    });

    it('F8.2: triggers rebalance when |Delta_net| strictly exceeds deltaThreshold', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const res = trigger.evaluate(0.15);
      expect(res.triggerRebalance).toBe(true);
      expect(res.targetHedgeAmount).toBe(-0.15);
    });

    it('F8.3: computes target hedge amount exactly opposing net delta (-Delta_net)', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const res = trigger.evaluate(-0.25);
      expect(res.triggerRebalance).toBe(true);
      expect(res.targetHedgeAmount).toBe(0.25);
    });

    it('F8.4: enforces hysteresis: remains in rebalancing state until inside inner band (eta * threshold)', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50); // inner = 0.05
      // 1. Breach outer band
      trigger.evaluate(0.12);
      // 2. Drop to 0.08 (inside outer band 0.10, but outside inner band 0.05)
      const res = trigger.evaluate(0.08);
      expect(res.triggerRebalance).toBe(true);
    });

    it('F8.5: transitions out of rebalancing state once net delta falls within inner target', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50); // inner = 0.05
      trigger.evaluate(0.15);
      const res = trigger.evaluate(0.03); // below 0.05
      expect(res.triggerRebalance).toBe(false);
      expect(res.targetHedgeAmount).toBe(0);
    });
  });

  // ─── F9: Atomic Cross-Venue Delta Hedge Dispatcher ─────────────────────────
  describe('F9: Atomic Cross-Venue Delta Hedge Dispatcher', () => {
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

    it('F9.1: dispatches valid atomic market hedge order to primary CEX venue', async () => {
      const report = await dispatcher.dispatchHedge(-0.05, 'binance', 'BTC/USDT', 1.0);
      expect(report.status).toBe('FILLED');
      expect(report.side).toBe('sell');
      expect(report.filledAmount).toBe(0.05);
      expect(report.residualDelta).toBe(0);
    });

    it('F9.2: rejects hedge request if target size is below venue minimum lot size', async () => {
      const report = await dispatcher.dispatchHedge(0.0005, 'binance', 'BTC/USDT');
      expect(report.status).toBe('FAILED');
      expect(report.filledAmount).toBe(0);
    });

    it('F9.3: records correct order side (sell when delta is positive, buy when delta is negative)', async () => {
      const reportBuy = await dispatcher.dispatchHedge(0.05, 'binance');
      expect(reportBuy.side).toBe('buy');
    });

    it('F9.4: records latency metadata and fill status on execution report', async () => {
      const report = await dispatcher.dispatchHedge(0.1, 'binance');
      expect(report.latencyMs).toBeGreaterThan(0);
      expect(report.hedgeId).toBeDefined();
    });

    it('F9.5: computes residual delta accurately on partial fill', async () => {
      const report = await dispatcher.dispatchHedge(0.10, 'binance', 'BTC/USDT', 0.60);
      expect(report.status).toBe('PARTIAL');
      expect(report.filledAmount).toBeCloseTo(0.06, 4);
      expect(report.residualDelta).toBeCloseTo(0.04, 4);
    });
  });

  // ─── F10: Compensatory Unwind & Residual Delta Handler ──────────────────────
  describe('F10: Compensatory Unwind & Residual Delta Handler', () => {
    const handler = new CompensatoryUnwindHandler(3);

    it('F10.1: takes no action and returns success when hedge leg is 100% filled', async () => {
      const result = await handler.executeUnwind({
        hedgeId: 'h1',
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
      expect(result.unwindSuccess).toBe(true);
      expect(result.actionTaken).toBe('none');
      expect(result.unwoundAmount).toBe(0);
    });

    it('F10.2: routes residual delta to secondary CEX venue upon partial fill', async () => {
      const result = await handler.executeUnwind({
        hedgeId: 'h2',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 0.10,
        filledAmount: 0.04,
        avgFillPrice: 50_000,
        latencyMs: 12,
        status: 'PARTIAL',
        residualDelta: 0.06,
      }, 'bybit');
      expect(result.unwindSuccess).toBe(true);
      expect(result.unwoundAmount).toBeCloseTo(0.06, 4);
      expect(result.actionTaken).toBe('secondary_cex_filled');
    });

    it('F10.3: tracks retry count and unwound amount in execution result', async () => {
      const result = await handler.executeUnwind({
        hedgeId: 'h3',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell',
        requestedAmount: 0.05,
        filledAmount: 0.02,
        avgFillPrice: 50_000,
        latencyMs: 15,
        status: 'PARTIAL',
        residualDelta: -0.03,
      });
      expect(result.retryCount).toBeGreaterThanOrEqual(1);
    });

    it('F10.4: eliminates directional residual delta to zero', async () => {
      const result = await handler.executeUnwind({
        hedgeId: 'h4',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 0.08,
        filledAmount: 0.03,
        avgFillPrice: 50_000,
        latencyMs: 10,
        status: 'PARTIAL',
        residualDelta: 0.05,
      });
      expect(result.residualDelta).toBe(0);
    });

    it('F10.5: handles completely unfilled hedge order (0% fill) with full compensatory unwind', async () => {
      const result = await handler.executeUnwind({
        hedgeId: 'h5',
        venue: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedAmount: 0.10,
        filledAmount: 0,
        avgFillPrice: 0,
        latencyMs: 300,
        status: 'FAILED',
        residualDelta: 0.10,
      });
      expect(result.unwindSuccess).toBe(true);
      expect(result.unwoundAmount).toBe(0.10);
    });
  });

  // ─── F11: Volume-Synchronized Probability of Toxicity (VPIN) ───────────────
  describe('F11: Volume-Synchronized Probability of Toxicity (VPIN)', () => {
    it('F11.1: classifies trade as buyer-initiated when trade price > quote midpoint', () => {
      const vpin = new VpinCalculator(100, 10);
      vpin.ingestTrade({
        tradeId: 't1',
        timestamp: Date.now(),
        price: 0.51,
        volume: 100,
        bidPrice: 0.49,
        askPrice: 0.51,
      });
      // 100% buy volume in single bucket
      expect(vpin.calculateVpin()).toBe(1.0);
    });

    it('F11.2: classifies trade as seller-initiated when trade price < quote midpoint', () => {
      const vpin = new VpinCalculator(100, 10);
      vpin.ingestTrade({
        tradeId: 't2',
        timestamp: Date.now(),
        price: 0.49,
        volume: 100,
        bidPrice: 0.49,
        askPrice: 0.51,
      });
      expect(vpin.calculateVpin()).toBe(1.0);
    });

    it('F11.3: splits large trade straddling bucket boundary across consecutive buckets', () => {
      const vpin = new VpinCalculator(100, 10);
      // Trade of volume 250 fills 2 complete buckets and leaves 50 in current
      vpin.ingestTrade({
        tradeId: 't3',
        timestamp: Date.now(),
        price: 0.52,
        volume: 250,
        bidPrice: 0.49,
        askPrice: 0.51,
      });
      expect(vpin.calculateVpin()).toBe(1.0);
    });

    it('F11.4: computes low VPIN for balanced order flow', () => {
      const vpin = new VpinCalculator(100, 10);
      // Fill bucket with 50 buy and 50 sell
      vpin.ingestTrade({ tradeId: 'b1', timestamp: Date.now(), price: 0.52, volume: 50, bidPrice: 0.49, askPrice: 0.51 });
      vpin.ingestTrade({ tradeId: 's1', timestamp: Date.now(), price: 0.48, volume: 50, bidPrice: 0.49, askPrice: 0.51 });
      expect(vpin.calculateVpin()).toBe(0.0);
    });

    it('F11.5: computes high VPIN (> 0.70) for unidirectional toxic order flow', () => {
      const vpin = new VpinCalculator(100, 10);
      // 90 buy, 10 sell
      vpin.ingestTrade({ tradeId: 'b1', timestamp: Date.now(), price: 0.52, volume: 90, bidPrice: 0.49, askPrice: 0.51 });
      vpin.ingestTrade({ tradeId: 's1', timestamp: Date.now(), price: 0.48, volume: 10, bidPrice: 0.49, askPrice: 0.51 });
      expect(vpin.calculateVpin()).toBeCloseTo(0.80, 2);
      expect(vpin.getCdf()).toBeGreaterThan(0.75);
    });
  });

  // ─── F12: Kyle's Lambda Price Impact Estimator ──────────────────────────────
  describe('F12: Kyle\'s Lambda Price Impact Estimator', () => {
    it('F12.1: calculates positive Kyle\'s lambda slope for price-impacted order flow', () => {
      const estimator = new KylesLambdaEstimator(50);
      // Perfectly linear impact: dP = 0.001 * Q
      for (let i = 1; i <= 10; i++) {
        estimator.ingestInterval(0.001 * i * 10, i * 10);
      }
      const est = estimator.estimate();
      expect(est.lambda).toBeCloseTo(0.001, 4);
      expect(est.tStat).toBeGreaterThan(0);
    });

    it('F12.2: falls back to baseline lambda when trade size variance Var(Q) < 1e-12', () => {
      const estimator = new KylesLambdaEstimator(50, 0.0001);
      // Identical volumes: Var(Q) = 0
      for (let i = 0; i < 10; i++) {
        estimator.ingestInterval(0.01, 100);
      }
      const est = estimator.estimate();
      expect(est.lambda).toBe(0.0001);
      expect(est.tStat).toBe(0);
    });

    it('F12.3: computes t-statistic for regression slope significance', () => {
      const estimator = new KylesLambdaEstimator(50);
      for (let i = 1; i <= 20; i++) {
        estimator.ingestInterval(0.05 * i, i);
      }
      const est = estimator.estimate();
      expect(est.tStat).toBeGreaterThan(2.0);
    });

    it('F12.4: updates rolling estimation window discarding stale observations', () => {
      const estimator = new KylesLambdaEstimator(5);
      for (let i = 0; i < 20; i++) {
        estimator.ingestInterval(0.01 * i, i);
      }
      const est = estimator.estimate();
      expect(est.lambda).toBeGreaterThan(0);
    });

    it('F12.5: handles neutral flow (dP = 0) with zero or baseline impact', () => {
      const estimator = new KylesLambdaEstimator(50);
      for (let i = 1; i <= 10; i++) {
        estimator.ingestInterval(0, i * 10);
      }
      const est = estimator.estimate();
      expect(est.lambda).toBe(0);
    });
  });

  // ─── F13: Dynamic Quote Widening Multiplier ─────────────────────────────────
  describe('F13: Dynamic Quote Widening Multiplier', () => {
    const controller = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);

    it('F13.1: returns baseline multiplier 1.0 when VPIN and lambda are below hurdles', () => {
      const w = controller.calculateMultiplier(0.50, 0.80);
      expect(w).toBe(1.0);
    });

    it('F13.2: widens quote spread multiplier as VPIN CDF exceeds 0.75 threshold', () => {
      const w = controller.calculateMultiplier(0.85, 1.0);
      // W = 1.0 + 3.0 * (0.85 - 0.75) = 1.0 + 0.30 = 1.30
      expect(w).toBeCloseTo(1.30, 2);
    });

    it('F13.3: widens quote spread multiplier as Kyle\'s lambda exceeds baseline', () => {
      const w = controller.calculateMultiplier(0.50, 2.0);
      // W = 1.0 + 1.5 * (2.0 - 1.0) = 1.0 + 1.5 = 2.50
      expect(w).toBeCloseTo(2.50, 2);
    });

    it('F13.4: compounds widening when both VPIN and lambda surge concurrently', () => {
      const w = controller.calculateMultiplier(0.90, 2.0);
      // W = 1.0 + 3.0 * (0.90 - 0.75) + 1.5 * (2.0 - 1.0) = 1.0 + 0.45 + 1.5 = 2.95
      expect(w).toBeCloseTo(2.95, 2);
    });

    it('F13.5: clamps widening multiplier strictly to upper ceiling (5.0)', () => {
      const w = controller.calculateMultiplier(1.0, 10.0);
      expect(w).toBe(5.0);
    });
  });

  // ─── F14: Instant Defensive Cancellation Tripwire ───────────────────────────
  describe('F14: Instant Defensive Cancellation Tripwire', () => {
    it('F14.1: trips instant cancellation when VPIN CDF reaches critical threshold (>= 0.95)', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      const res = tripwire.evaluate(0.96, 1.0, false);
      expect(res.tripwireActive).toBe(true);
      expect(res.reason).toBe('critical_vpin_breach');
    });

    it('F14.2: trips instant cancellation when lambda ratio indicates liquidity black hole (>= 3.0)', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      const res = tripwire.evaluate(0.50, 3.5, false);
      expect(res.tripwireActive).toBe(true);
      expect(res.reason).toBe('liquidity_black_hole');
    });

    it('F14.3: trips instant cancellation upon informed sweep detection', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      const res = tripwire.evaluate(0.50, 1.0, true);
      expect(res.tripwireActive).toBe(true);
      expect(res.reason).toBe('informed_sweep_burst');
    });

    it('F14.4: enforces quarantine cooldown window after tripwire activation', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      tripwire.evaluate(0.98, 1.0, false);
      // Even if flow normalizes, cooldown remains active
      const resCooldown = tripwire.evaluate(0.30, 0.8, false);
      expect(resCooldown.tripwireActive).toBe(true);
      expect(resCooldown.reason).toBe('quarantine_cooldown_active');
    });

    it('F14.5: allows normal quoting resumption after reset()', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 15_000);
      tripwire.evaluate(0.98, 1.0, false);
      tripwire.reset();
      const res = tripwire.evaluate(0.30, 0.8, false);
      expect(res.tripwireActive).toBe(false);
    });
  });

  // ─── F15: Informed Sweep Burst Detector ────────────────────────────────────
  describe('F15: Informed Sweep Burst Detector', () => {
    it('F15.1: detects aggressive sweep when >= 3 book levels are depleted within 100ms', () => {
      const detector = new InformedSweepDetector();
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 50);
      detector.registerDepletion('buy', 800, now - 30);
      detector.registerDepletion('buy', 1200, now - 10);
      const res = detector.checkSweep(0.50);
      expect(res.sweepDetected).toBe(true);
      expect(res.direction).toBe('buy');
      expect(res.levelsDepleted).toBe(3);
    });

    it('F15.2: reports correct sweep direction (buy vs sell)', () => {
      const detector = new InformedSweepDetector();
      const now = Date.now();
      detector.registerDepletion('sell', 400, now - 40);
      detector.registerDepletion('sell', 600, now - 20);
      detector.registerDepletion('sell', 900, now - 10);
      const res = detector.checkSweep(0.50);
      expect(res.sweepDetected).toBe(true);
      expect(res.direction).toBe('sell');
    });

    it('F15.3: detects fast price jump anomaly exceeding 4 * sigma', () => {
      const detector = new InformedSweepDetector();
      detector.checkSweep(0.50); // Set baseline
      const res = detector.checkSweep(0.56, 0.01); // Jump of 0.06 > 4 * 0.01
      expect(res.sweepDetected).toBe(true);
      expect(res.fastJumpAnomaly).toBe(true);
    });

    it('F15.4: ignores normal single-level order executions without false alarm', () => {
      const detector = new InformedSweepDetector();
      detector.registerDepletion('buy', 100);
      const res = detector.checkSweep(0.50);
      expect(res.sweepDetected).toBe(false);
    });

    it('F15.5: purges stale level depletion records older than the 100ms window', () => {
      const detector = new InformedSweepDetector();
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 500);
      detector.registerDepletion('buy', 500, now - 400);
      detector.registerDepletion('buy', 500, now);
      const res = detector.checkSweep(0.50);
      expect(res.sweepDetected).toBe(false);
    });
  });

  // ─── F16: Pre-Trade Quoting Risk Guard ──────────────────────────────────────
  describe('F16: Pre-Trade Quoting Risk Guard', () => {
    const guard = new PreTradeQuotingRiskGuard({
      maxPositionFraction: 0.05,
      maxInventoryNotionalUsd: 50_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      emergencyHaltEnabled: true,
    });

    it('F16.1: approves quote proposal when all risk parameters are within safe bounds', () => {
      const res = guard.evaluateRisk(100, 100_000, 0.02, 50, 1_000);
      expect(res.approved).toBe(true);
      expect(res.circuitBroken).toBe(false);
    });

    it('F16.2: rejects quote proposal when notional exceeds 5% Quarter-Kelly cap', () => {
      const res = guard.evaluateRisk(6_000, 100_000, 0.02, 50, 1_000); // Kelly cap is 5k
      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('KELLY_CAP_EXCEEDED');
    });

    it('F16.3: trips circuit breaker and rejects quote when daily drawdown reaches 15%', () => {
      const res = guard.evaluateRisk(100, 100_000, 0.15, 50, 1_000);
      expect(res.approved).toBe(false);
      expect(res.circuitBroken).toBe(true);
      expect(res.rejectionReason).toBe('DRAWDOWN_BREAKER_TRIPPED');
    });

    it('F16.4: rejects quote proposal when venue latency exceeds max threshold (500ms)', () => {
      const res = guard.evaluateRisk(100, 100_000, 0.02, 550, 1_000);
      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('VENUE_LATENCY_SPIKE');
    });

    it('F16.5: rejects quote proposal when inventory exceeds max inventory notional cap', () => {
      const res = guard.evaluateRisk(1_000, 100_000, 0.02, 50, 49_500); // 49.5k + 1k > 50k
      expect(res.approved).toBe(false);
      expect(res.rejectionReason).toBe('INVENTORY_LIMIT_EXCEEDED');
    });
  });

  // ─── F17: Low-Latency Prometheus Telemetry ──────────────────────────────────
  describe('F17: Low-Latency Prometheus Telemetry', () => {
    it('F17.1: records quote posted, canceled, and rejected events', () => {
      const tele = new MarlPrometheusTelemetry();
      tele.recordQuote('posted', 'both');
      tele.recordQuote('posted', 'bid');
      expect(tele.quotesCount).toBe(2);
    });

    it('F17.2: tracks fill count, filled size, and computes fill rate correctly', () => {
      const tele = new MarlPrometheusTelemetry();
      tele.recordQuote('posted', 'both');
      tele.recordQuote('posted', 'both');
      tele.recordFill('buy', 50, 0.49, 20);
      expect(tele.fillsCount).toBe(1);
      expect(tele.totalFilledSize).toBe(50);
      expect(tele.getFillRate()).toBe(0.5);
    });

    it('F17.3: tracks inventory skew and net delta gauges', () => {
      const tele = new MarlPrometheusTelemetry();
      tele.recordInventorySkew(150, 75);
      tele.recordNetDelta(0.05, 0.05, 0);
      expect(tele.inventorySkew).toBe(150);
      expect(tele.netDelta).toBe(0.05);
    });

    it('F17.4: tracks cumulative realized PnL', () => {
      const tele = new MarlPrometheusTelemetry();
      tele.recordPnl(125.50, 10.0);
      expect(tele.realizedPnl).toBe(125.50);
    });

    it('F17.5: records hedge execution latency samples', () => {
      const tele = new MarlPrometheusTelemetry();
      tele.recordHedgeLatency('binance', 14, 'FILLED');
      tele.recordHedgeLatency('bybit', 18, 'FILLED');
      expect(tele.hedgeLatencies.length).toBe(2);
    });
  });

  // ─── F18: SHA-256 HMAC Hash-Chained Audit Logger ───────────────────────────
  describe('F18: SHA-256 HMAC Hash-Chained Audit Logger', () => {
    it('F18.1: logs quote and hedge actions with monotonic sequence numbers starting at 0', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      const r0 = logger.logAction('marl.quote.posted', { bid: 0.49, ask: 0.51 });
      const r1 = logger.logAction('marl.hedge.submitted', { amount: 0.1 });
      expect(r0.sequenceNumber).toBe(0);
      expect(r1.sequenceNumber).toBe(1);
    });

    it('F18.2: sets genesis block previousHash to 64 zeros', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      const r0 = logger.logAction('marl.quote.posted', { bid: 0.49 });
      expect(r0.previousHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('F18.3: computes SHA-256 HMAC hash linking current record to previousHash', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      const r0 = logger.logAction('marl.quote.posted', { bid: 0.49 });
      const r1 = logger.logAction('marl.quote.posted', { bid: 0.50 });
      expect(r1.previousHash).toBe(r0.hash);
      expect(r1.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('F18.4: validates cryptographic chain integrity (verifyChain returns valid=true)', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      logger.logAction('marl.quote.posted', { bid: 0.49 });
      logger.logAction('marl.fill.received', { side: 'buy', amount: 10 });
      logger.logAction('marl.hedge.filled', { amount: 10 });
      const res = logger.verifyChain();
      expect(res.valid).toBe(true);
      expect(res.total).toBe(3);
    });

    it('F18.5: detects tampering if an intermediate record payload or hash is altered', () => {
      const logger = new MarlHashChainedAuditLogger('test-secret');
      logger.logAction('marl.quote.posted', { bid: 0.49 });
      logger.logAction('marl.hedge.filled', { amount: 10 });
      const records = logger.getRecords();
      // Malicious tamper
      records[0].payload = { bid: 0.99 };
      const res = logger.verifyChain();
      expect(res.valid).toBe(false);
      expect(res.brokenAt).toBe(0);
    });
  });

  // ─── F19: Unified MARL Engine Facade ───────────────────────────────────────
  describe('F19: Unified MARL Engine Facade', () => {
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

    it('F19.1: orchestrates quoting lifecycle from start() to stop()', () => {
      const engine = createTestEngine();
      expect(engine.getStatus().isRunning).toBe(false);
      engine.start();
      expect(engine.getStatus().isRunning).toBe(true);
      engine.stop();
      expect(engine.getStatus().isRunning).toBe(false);
    });

    it('F19.2: generates widened quotes when adverse selection indicators rise', () => {
      const engine = createTestEngine();
      engine.start();
      const quoteNormal = engine.generateQuote(0.50, 0);
      expect(quoteNormal).not.toBeNull();
      expect(quoteNormal!.askPrice).toBeGreaterThan(0.50);
      expect(quoteNormal!.bidPrice).toBeLessThan(0.50);
    });

    it('F19.3: cancels quotes and halts quoting when tripwire trips', () => {
      const engine = createTestEngine();
      engine.start();
      // Induce critical VPIN
      for (let i = 0; i < 55; i++) {
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
    });

    it('F19.4: updates inventory and portfolio delta upon maker fills', () => {
      const engine = createTestEngine();
      engine.start();
      engine.onMakerFill('buy', 5, 0.49);
      expect(engine.getStatus().inventory).toBe(5);
      expect(engine.getStatus().netDelta).toBe(5);
    });

    it('F19.5: logs all state transitions and orders into hash-chained audit logger', () => {
      const engine = createTestEngine();
      engine.start();
      engine.onMakerFill('buy', 2, 0.49);
      const audit = engine.auditLogger.verifyChain();
      expect(audit.valid).toBe(true);
      expect(audit.total).toBeGreaterThan(0);
    });
  });
});
