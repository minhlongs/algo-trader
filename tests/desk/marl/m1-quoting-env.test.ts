/**
 * Comprehensive Unit Test Suite for Milestone 1: Multi-Agent Quoting & Market-Making Environment.
 * Tests Avellaneda-Stoikov mathematical formulas, Polymarket boundary clamps, volatility estimation,
 * arrival intensity, quoting agents, multi-agent coordination, orderbook normalization, and replay engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateReservationPrice,
  calculateOptimalSpreadBase,
  calculateOptimalQuotes,
  quantizeToTick,
  AvellanedaStoikovModel,
} from '../../../src/desk/marl/models/avellaneda-stoikov';
import {
  calculateRealizedVolatility,
  calculateParkinsonVolatility,
  RollingVolatilityEstimator,
} from '../../../src/desk/marl/models/volatility-estimator';
import {
  calculateArrivalIntensity,
  calculateFillProbability,
  calculateExpectedFillTime,
  simulateFillEvent,
} from '../../../src/desk/marl/models/arrival-intensity';
import { AdaptiveQuotingAgent } from '../../../src/desk/marl/agents/adaptive-quoting-agent';
import { InventorySkewAgent } from '../../../src/desk/marl/agents/inventory-skew-agent';
import { MultiAgentCoordinator } from '../../../src/desk/marl/agents/multi-agent-coordinator';
import { OrderBookNormalizer } from '../../../src/desk/marl/environment/orderbook-normalizer';
import { MarketReplayEngine } from '../../../src/desk/marl/environment/market-replay-engine';
import { LiveStreamAdapter } from '../../../src/desk/marl/environment/live-stream-adapter';
import type { MarlAgentConfig, AgentObservation, AvellanedaStoikovParams, QuoteCalculationResult } from '../../../src/desk/marl';

describe('Milestone 1 — MARL Quoting & Market-Making Environment', () => {
  const sampleObservation: AgentObservation = {
    symbol: 'BTC-2026-YES',
    venue: 'polymarket',
    midPrice: 0.50,
    bestBid: 0.49,
    bestAsk: 0.51,
    spread: 0.02,
    orderBookImbalance: 0.0,
    depthImbalance: 0.0,
    inventory: 0,
    timeToHorizonSec: 86400,
    volatility: 0.02,
    netDelta: 0,
    timestamp: Date.now(),
  };

  const sampleConfig: MarlAgentConfig = {
    agentId: 'agent-adaptive-1',
    agentType: 'adaptive',
    gamma: 0.1,
    kappa: 1.5,
    maxInventory: 1000,
    quoteSize: 100,
    minSpread: 0.02,
    maxSpread: 0.20,
    tickSize: 0.01,
    enabled: true,
    weight: 1.0,
  };

  // ─── 1. Avellaneda-Stoikov Mathematical Equations ─────────────────────────────
  describe('1. Avellaneda-Stoikov Optimal Quoting Model', () => {
    it('calculates reservation price r(s, q, t) = s - q*gamma*sigma^2*tau correctly', () => {
      const midPrice = 0.50;
      const gamma = 0.1;
      const sigma = 0.2;
      const timeToHorizon = 1.0;

      // With q = 0, reservation price equals midPrice
      const rZero = calculateReservationPrice({ midPrice, inventory: 0, gamma, sigma, timeToHorizon });
      expect(rZero).toBe(0.50);

      // With positive inventory q > 0, reservation price is below midPrice (MM wants to sell)
      const rLong = calculateReservationPrice({ midPrice, inventory: 10, gamma, sigma, timeToHorizon });
      // r = 0.50 - 10 * 0.1 * 0.04 * 1.0 = 0.50 - 0.04 = 0.46
      expect(rLong).toBeCloseTo(0.46, 5);

      // With negative inventory q < 0, reservation price is above midPrice (MM wants to buy)
      const rShort = calculateReservationPrice({ midPrice, inventory: -10, gamma, sigma, timeToHorizon });
      // r = 0.50 - (-10) * 0.1 * 0.04 * 1.0 = 0.50 + 0.04 = 0.54
      expect(rShort).toBeCloseTo(0.54, 5);
    });

    it('exhibits correct inventory sensitivity dr/dq < 0', () => {
      const p1 = calculateReservationPrice({ midPrice: 0.50, inventory: 5, gamma: 0.1, sigma: 0.1, timeToHorizon: 1 });
      const p2 = calculateReservationPrice({ midPrice: 0.50, inventory: 10, gamma: 0.1, sigma: 0.1, timeToHorizon: 1 });
      expect(p2).toBeLessThan(p1);
    });

    it('demonstrates terminal horizon decay: as tau -> 0, reservation price approaches midPrice', () => {
      const rLongT10 = calculateReservationPrice({ midPrice: 0.50, inventory: 20, gamma: 0.2, sigma: 0.1, timeToHorizon: 10 });
      const rLongT0 = calculateReservationPrice({ midPrice: 0.50, inventory: 20, gamma: 0.2, sigma: 0.1, timeToHorizon: 0 });
      expect(rLongT10).toBeLessThan(0.50);
      expect(rLongT0).toBe(0.50);
    });

    it('calculates optimal spread base (1/kappa)*ln(1 + gamma/kappa)', () => {
      const gamma = 0.1;
      const kappa = 1.5;
      const expected = (1 / 1.5) * Math.log(1 + 0.1 / 1.5);
      const spreadBase = calculateOptimalSpreadBase(gamma, kappa);
      expect(spreadBase).toBeCloseTo(expected, 6);
    });

    it('computes quotes symmetric around reservation price and asymmetric around mid-price when skewed', () => {
      const res = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 15,
        gamma: 0.1,
        kappa: 1.5,
        sigma: 0.05,
        timeToHorizon: 1.0,
        tickSize: 0.001,
        minSpread: 0.01,
      });

      // When q > 0, reservation price < midPrice
      expect(res.reservationPrice).toBeLessThan(0.50);
      // Ask should be closer to midPrice than bid is to midPrice
      expect(res.askSpread).toBeLessThan(res.bidSpread);
    });
  });

  // ─── 2. Polymarket Constraints, Tick Discretization & Clamping ────────────────
  describe('2. Polymarket Discretization & Boundary Clamps', () => {
    it('quantizes prices to specified tick increments', () => {
      expect(quantizeToTick(0.5234, 0.01)).toBe(0.52);
      expect(quantizeToTick(0.5276, 0.01)).toBe(0.53);
      expect(quantizeToTick(0.5234, 0.001)).toBe(0.523);
    });

    it('clamps quotes to [0.01, 0.99] on extreme inventory skew', () => {
      // Very large positive inventory should drive bid down towards floor, but never below 0.01
      const resLow = calculateOptimalQuotes({
        midPrice: 0.05,
        inventory: 1000,
        gamma: 1.0,
        kappa: 1.0,
        sigma: 0.5,
        timeToHorizon: 10,
        tickSize: 0.01,
      });
      expect(resLow.bidPrice).toBeGreaterThanOrEqual(0.01);
      expect(resLow.askPrice).toBeLessThanOrEqual(0.99);
      expect(resLow.clamped).toBe(true);

      // Very large negative inventory should drive ask up towards ceiling, but never above 0.99
      const resHigh = calculateOptimalQuotes({
        midPrice: 0.95,
        inventory: -1000,
        gamma: 1.0,
        kappa: 1.0,
        sigma: 0.5,
        timeToHorizon: 10,
        tickSize: 0.01,
      });
      expect(resHigh.bidPrice).toBeGreaterThanOrEqual(0.01);
      expect(resHigh.askPrice).toBeLessThanOrEqual(0.99);
      expect(resHigh.clamped).toBe(true);
    });

    it('enforces non-crossing guarantee: askPrice >= bidPrice + tickSize', () => {
      const res = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 500,
        gamma: 0.5,
        kappa: 10.0,
        sigma: 0.2,
        timeToHorizon: 1.0,
        tickSize: 0.01,
        minSpread: 0.01,
      });
      expect(res.askPrice).toBeGreaterThan(res.bidPrice);
      expect(res.askPrice - res.bidPrice).toBeGreaterThanOrEqual(0.01);
    });

    it('enforces minimum spread constraint', () => {
      const res = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.001,
        kappa: 100.0, // tiny natural spread
        sigma: 0.01,
        timeToHorizon: 1.0,
        tickSize: 0.01,
        minSpread: 0.04,
      });
      expect(res.totalSpread).toBeGreaterThanOrEqual(0.04);
      expect(res.clamped).toBe(true);
    });

    it('AvellanedaStoikovModel class wrapper provides correct quote result', () => {
      const model = new AvellanedaStoikovModel({
        gamma: 0.1,
        kappa: 1.5,
        sigma: 0.02,
        terminalHorizonSec: 86400,
        tickSize: 0.01,
        minSpread: 0.02,
        maxSpread: 0.20,
        maxInventory: 10000,
        quoteSize: 100,
      });
      const quotes = model.getQuotes(0.50, 0, 1.0);
      expect(quotes.bidPrice).toBeLessThan(0.50);
      expect(quotes.askPrice).toBeGreaterThan(0.50);
      expect(quotes.totalSpread).toBeGreaterThanOrEqual(0.02);
    });
  });

  // ─── 3. Volatility & Arrival Intensity Models ─────────────────────────────────
  describe('3. Volatility Estimator & Arrival Intensity', () => {
    it('calculates realized volatility of price series', () => {
      const prices = [100, 102, 101, 103, 102, 104];
      const vol = calculateRealizedVolatility(prices);
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(0.10);

      // Flat prices have 0 volatility
      expect(calculateRealizedVolatility([100, 100, 100])).toBe(0);
      // Less than 2 prices returns 0
      expect(calculateRealizedVolatility([100])).toBe(0);
    });

    it('calculates Parkinson volatility from high/low intervals', () => {
      const samples = [
        { high: 102, low: 99 },
        { high: 103, low: 100 },
        { high: 104, low: 101 },
      ];
      const pVol = calculateParkinsonVolatility(samples);
      expect(pVol).toBeGreaterThan(0);
      expect(calculateParkinsonVolatility([])).toBe(0);
    });

    it('RollingVolatilityEstimator updates on streaming prices and resets', () => {
      const estimator = new RollingVolatilityEstimator(5, 0.02);
      expect(estimator.getVolatility()).toBe(0.02);

      estimator.update(0.50);
      estimator.update(0.51);
      estimator.update(0.49);
      estimator.update(0.52);

      expect(estimator.getSampleCount()).toBe(4);
      expect(estimator.getVolatility()).toBeGreaterThan(0);

      estimator.reset();
      expect(estimator.getSampleCount()).toBe(0);
      expect(estimator.getVolatility()).toBe(0.02);
    });

    it('calculates Poisson arrival intensity lambda(delta) = A*exp(-kappa*delta)', () => {
      const A = 10.0;
      const kappa = 2.0;

      const lambdaAtMid = calculateArrivalIntensity(0.0, { baselineArrivalRate: A, kappa });
      expect(lambdaAtMid).toBe(10.0);

      const lambdaFar = calculateArrivalIntensity(0.05, { baselineArrivalRate: A, kappa });
      expect(lambdaFar).toBeCloseTo(10.0 * Math.exp(-2.0 * 0.05), 5);
      expect(lambdaFar).toBeLessThan(lambdaAtMid);
    });

    it('calculates fill probability and discounts for queue position', () => {
      const params = {
        spreadDistance: 0.01,
        baselineArrivalRate: 2.0,
        kappa: 1.5,
        timeDeltaSec: 1.0,
      };

      const probAtFront = calculateFillProbability({ ...params, queueAhead: 0 });
      const probInQueue = calculateFillProbability({ ...params, queueAhead: 500, typicalLevelVolume: 100 });

      expect(probAtFront).toBeGreaterThan(0);
      expect(probInQueue).toBeLessThan(probAtFront);
    });

    it('calculates expected fill time and simulates fill event', () => {
      const expTime = calculateExpectedFillTime(0.01, { baselineArrivalRate: 5.0, kappa: 1.5 });
      expect(expTime).toBeGreaterThan(0);
      expect(Number.isFinite(expTime)).toBe(true);

      const alwaysFills = simulateFillEvent(
        { spreadDistance: 0, baselineArrivalRate: 10, kappa: 1, timeDeltaSec: 10 },
        0.0001,
      );
      expect(alwaysFills).toBe(true);
    });
  });

  // ─── 4. Quoting Agents (Adaptive & Inventory Skew) ─────────────────────────────
  describe('4. Competitive Quoting Agents', () => {
    it('AdaptiveQuotingAgent skews quotes based on orderbook imbalance', () => {
      const agent = new AdaptiveQuotingAgent(sampleConfig, 0.8);

      // Balanced book
      const qBalanced = agent.computeQuote(sampleObservation);

      // Book with heavy positive imbalance (excess bids, buying pressure)
      const qBullish = agent.computeQuote({
        ...sampleObservation,
        orderBookImbalance: 0.8,
      });

      // Price is expected to rise, so bid and ask should shift upwards
      expect(qBullish.bidPrice).toBeGreaterThanOrEqual(qBalanced.bidPrice);
      expect(qBullish.askPrice).toBeGreaterThanOrEqual(qBalanced.askPrice);
      expect(qBullish.skewFactor).toBeGreaterThan(0);
    });

    it('AdaptiveQuotingAgent tracks fills and updates inventory and cash balance', () => {
      const agent = new AdaptiveQuotingAgent(sampleConfig);
      expect(agent.getInventory()).toBe(0);

      // Receive buy fill
      agent.onFill({
        fillId: 'fill-1',
        orderId: 'ord-1',
        agentId: sampleConfig.agentId,
        symbol: 'BTC-2026-YES',
        venue: 'polymarket',
        side: 'buy',
        price: 0.49,
        amount: 50,
        fee: 0.05,
        liquidity: 'maker',
        timestamp: Date.now(),
      });

      expect(agent.getInventory()).toBe(50);
      expect(agent.getCashBalance()).toBeCloseTo(-50 * 0.49 - 0.05, 4);

      // Receive sell fill (unwind)
      agent.onFill({
        fillId: 'fill-2',
        orderId: 'ord-2',
        agentId: sampleConfig.agentId,
        symbol: 'BTC-2026-YES',
        venue: 'polymarket',
        side: 'sell',
        price: 0.51,
        amount: 50,
        fee: 0.05,
        liquidity: 'maker',
        timestamp: Date.now(),
      });

      expect(agent.getInventory()).toBe(0);
      expect(agent.getRealizedPnl()).toBeGreaterThan(0);
    });

    it('InventorySkewAgent aggressively shifts quotes and suppresses congested side', () => {
      const agent = new InventorySkewAgent(sampleConfig, 2.5, 0.8);

      // When inventory is near positive max (e.g. 850 / 1000 = 85%), triggers ASK_ONLY mode
      agent.setInventory(850);
      const quoteLong = agent.computeQuote(sampleObservation);

      expect(quoteLong.bidSize).toBe(0); // Bid suppressed
      expect(quoteLong.askSize).toBeGreaterThan(sampleConfig.quoteSize); // Larger ask to shed inventory
      expect(quoteLong.metadata?.mode).toBe('ASK_ONLY');

      // When inventory is near negative max (-850 / 1000 = -85%), triggers BID_ONLY mode
      agent.setInventory(-850);
      const quoteShort = agent.computeQuote(sampleObservation);

      expect(quoteShort.askSize).toBe(0); // Ask suppressed
      expect(quoteShort.bidSize).toBeGreaterThan(sampleConfig.quoteSize); // Larger bid to cover inventory
      expect(quoteShort.metadata?.mode).toBe('BID_ONLY');
    });
  });

  // ─── 5. Multi-Agent Coordinator ───────────────────────────────────────────────
  describe('5. Multi-Agent Coordinator & Aggregation', () => {
    let coordinator: MultiAgentCoordinator;
    let adaptiveAgent: AdaptiveQuotingAgent;
    let skewAgent: InventorySkewAgent;

    beforeEach(() => {
      adaptiveAgent = new AdaptiveQuotingAgent({ ...sampleConfig, agentId: 'agent-adaptive' });
      skewAgent = new InventorySkewAgent({ ...sampleConfig, agentId: 'agent-skew' });
      coordinator = new MultiAgentCoordinator([adaptiveAgent, skewAgent]);
    });

    it('registers and unregisters quoting agents', () => {
      expect(coordinator.getAllAgents().length).toBe(2);
      expect(coordinator.getAgent('agent-adaptive')).toBeDefined();

      coordinator.unregisterAgent('agent-adaptive');
      expect(coordinator.getAllAgents().length).toBe(1);
      expect(coordinator.getAgent('agent-adaptive')).toBeUndefined();
    });

    it('generates proposals from all active agents', () => {
      const proposals = coordinator.generateProposals(sampleObservation);
      expect(proposals.length).toBe(2);
      expect(proposals.some((p) => p.agentId === 'agent-adaptive')).toBe(true);
      expect(proposals.some((p) => p.agentId === 'agent-skew')).toBe(true);
    });

    it('aggregates quotes under best_quote mode by choosing tightest competitive market', () => {
      const proposal = coordinator.coordinate(sampleObservation, 'best_quote');
      expect(proposal).not.toBeNull();
      expect(proposal!.bidPrice).toBeLessThan(proposal!.askPrice);
      expect(proposal!.agentId).toBe('coordinator:best_quote');
    });

    it('aggregates quotes under weighted_average mode', () => {
      const proposal = coordinator.coordinate(sampleObservation, 'weighted_average');
      expect(proposal).not.toBeNull();
      expect(proposal!.agentId).toBe('coordinator:weighted_average');
      expect(proposal!.bidPrice).toBeLessThan(proposal!.askPrice);
    });

    it('dispatches fill events to the appropriate agent', () => {
      const fill = {
        fillId: 'coord-fill-1',
        orderId: 'coord-ord-1',
        agentId: 'agent-adaptive',
        symbol: 'BTC-2026-YES',
        venue: 'polymarket',
        side: 'buy' as const,
        price: 0.49,
        amount: 25,
        fee: 0.01,
        liquidity: 'maker' as const,
        timestamp: Date.now(),
      };

      coordinator.dispatchFill(fill);
      expect(adaptiveAgent.getInventory()).toBe(25);
      expect(skewAgent.getInventory()).toBe(0); // Target agent was adaptive
    });
  });

  // ─── 6. Orderbook Normalizer ──────────────────────────────────────────────────
  describe('6. Orderbook Normalizer', () => {
    it('normalizes Polymarket string-based CLOB format to MarlOrderBook', () => {
      const rawClob = {
        tokenId: 'TOKEN-XYZ',
        bids: [
          { price: '0.48', size: '100' },
          { price: '0.49', size: '200' },
        ],
        asks: [
          { price: '0.52', size: '150' },
          { price: '0.51', size: '250' },
        ],
      };

      const book = OrderBookNormalizer.normalizeClob(rawClob);
      expect(book.symbol).toBe('TOKEN-XYZ');
      expect(book.venue).toBe('polymarket');

      // Bids sorted descending
      expect(book.bids[0]?.price).toBe(0.49);
      expect(book.bids[0]?.size).toBe(200);

      // Asks sorted ascending
      expect(book.asks[0]?.price).toBe(0.51);
      expect(book.asks[0]?.size).toBe(250);
    });

    it('normalizes CEX tuple format to MarlOrderBook', () => {
      const rawCex = {
        symbol: 'BTC/USDT',
        venue: 'binance',
        bids: [
          ['60000.5', '1.5'],
          ['60001.0', '2.0'],
        ] as [string, string][],
        asks: [
          ['60005.0', '1.0'],
          ['60003.5', '2.5'],
        ] as [string, string][],
      };

      const book = OrderBookNormalizer.normalizeCex(rawCex);
      expect(book.symbol).toBe('BTC/USDT');
      expect(book.bids[0]?.price).toBe(60001.0);
      expect(book.asks[0]?.price).toBe(60003.5);
    });

    it('computes microstructural indicators: micro-price and orderbook imbalance', () => {
      const book = OrderBookNormalizer.normalizeClob({
        tokenId: 'TOKEN-1',
        bids: [{ price: '0.49', size: '300' }],
        asks: [{ price: '0.51', size: '100' }],
      });

      const micro = OrderBookNormalizer.computeMicrostructure(book);
      expect(micro.midPrice).toBe(0.50);
      expect(micro.spread).toBe(0.02);
      // Imbalance = (300 - 100) / (300 + 100) = 0.50
      expect(micro.l1Imbalance).toBeCloseTo(0.50, 4);
      // Micro-price shifts towards the heavier bid side (ask * bidVol + bid * askVol) / total
      // = (0.51 * 300 + 0.49 * 100) / 400 = (153 + 49) / 400 = 202 / 400 = 0.505
      expect(micro.microPrice).toBeCloseTo(0.505, 4);
    });

    it('generates valid AgentObservation with 24-D normalized vector', () => {
      const book = OrderBookNormalizer.normalizeClob({
        tokenId: 'TOKEN-2',
        bids: [{ price: '0.48', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
      });

      const obs = OrderBookNormalizer.toObservation(book, 500, 3600, 0.05, 100);
      expect(obs.symbol).toBe('TOKEN-2');
      expect(obs.observationVector).toBeDefined();
      expect(obs.observationVector?.length).toBe(24);
      // Normalized inventory in [-1, 1]
      expect(obs.observationVector![0]).toBeCloseTo(500 / 10000, 4);
    });
  });

  // ─── 7. Synthetic Market Replay Engine ─────────────────────────────────────────
  describe('7. Market Replay Engine (Deterministic Synthetic Simulation)', () => {
    it('produces identical deterministic trajectories given the same random seed', () => {
      const config = {
        symbol: 'BTC-2026-YES',
        venue: 'polymarket',
        initialMidPrice: 0.50,
        tickSize: 0.01,
        stepCount: 10,
        timeStepSec: 1.0,
        randomSeed: 42,
        arrivalIntensity: 2.0,
        queueDepletionFactor: 0.5,
        volatility: 0.02,
      };

      const engine1 = new MarketReplayEngine(config);
      const engine2 = new MarketReplayEngine(config);

      const prices1: number[] = [];
      const prices2: number[] = [];

      for (let i = 0; i < 10; i++) {
        prices1.push(engine1.step().midPrice);
        prices2.push(engine2.step().midPrice);
      }

      expect(prices1).toEqual(prices2);
    });

    it('matches crossing orders immediately with full fills', () => {
      const engine = new MarketReplayEngine({
        symbol: 'BTC-2026-YES',
        initialMidPrice: 0.50,
        tickSize: 0.01,
        stepCount: 5,
        timeStepSec: 1.0,
        randomSeed: 999,
        arrivalIntensity: 1.0,
        queueDepletionFactor: 0.5,
        volatility: 0.001,
      });

      // Submit an aggressive marketable order: buy at 0.55 (well above current ask ~0.51)
      const proposal = {
        agentId: 'ag-test',
        symbol: 'BTC-2026-YES',
        venue: 'polymarket',
        bidPrice: 0.55,
        bidSize: 50,
        askPrice: 0.60,
        askSize: 0,
        reservationPrice: 0.55,
        bidSpread: -0.05,
        askSpread: 0.10,
        confidence: 1.0,
        timestamp: Date.now(),
      };

      engine.submitQuote(proposal);
      const res = engine.step();

      expect(res.fills.length).toBeGreaterThan(0);
      const buyFill = res.fills.find((f) => f.side === 'buy');
      expect(buyFill).toBeDefined();
      expect(buyFill?.amount).toBe(50);
      expect(buyFill?.liquidity).toBe('maker');
    });

    it('resets replay engine state and step counter', () => {
      const engine = new MarketReplayEngine({
        symbol: 'BTC-2026-YES',
        initialMidPrice: 0.50,
        stepCount: 10,
        timeStepSec: 1.0,
      });

      engine.step();
      engine.step();
      expect(engine.getActiveOrders()).toEqual([]);

      engine.reset();
      expect(engine.getCurrentMidPrice()).toBe(0.50);
    });
  });

  // ─── 8. Live Stream Adapter ───────────────────────────────────────────────────
  describe('8. Live Stream Adapter', () => {
    it('manages connection lifecycle, ingests raw CLOB, and emits orderbook events', () => {
      const adapter = new LiveStreamAdapter({ symbol: 'ETH-2026-YES', heartbeatTimeoutMs: 1000 });
      let emittedBook = false;
      let emittedObs = false;

      adapter.on('orderbook', () => { emittedBook = true; });
      adapter.on('observation', () => { emittedObs = true; });

      adapter.start();
      expect(adapter.isFeedHealthy()).toBe(true);

      adapter.ingestRawClob({
        tokenId: 'ETH-2026-YES',
        bids: [{ price: '0.40', size: '500' }],
        asks: [{ price: '0.42', size: '500' }],
      });

      expect(emittedBook).toBe(true);
      expect(emittedObs).toBe(true);
      expect(adapter.getCurrentBook()?.bids[0]?.price).toBe(0.40);

      adapter.stop();
      expect(adapter.isFeedHealthy()).toBe(false);
    });

    it('triggers stale_feed and cancel_all_quotes when heartbeat exceeds timeout', () => {
      const adapter = new LiveStreamAdapter({ symbol: 'ETH-2026-YES', heartbeatTimeoutMs: 10 });
      let cancelQuotesTriggered = false;
      let staleFeedTriggered = false;

      adapter.on('cancel_all_quotes', () => { cancelQuotesTriggered = true; });
      adapter.on('stale_feed', () => { staleFeedTriggered = true; });

      adapter.start();
      // Force update timestamp into the past to trigger heartbeat check
      (adapter as unknown as { lastUpdateTimestamp: number }).lastUpdateTimestamp = Date.now() - 100;
      (adapter as unknown as { checkHeartbeat(): void }).checkHeartbeat();

      expect(cancelQuotesTriggered).toBe(true);
      expect(staleFeedTriggered).toBe(true);
      adapter.stop();
    });
  });

  // ─── 9. Adversarial & Boundary Hardening ──────────────────────────────────────
  describe('9. Adversarial & Boundary Hardening', () => {
    it('handles zero volatility and negative tau safely', () => {
      const rZeroVol = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 100,
        gamma: 0.1,
        sigma: 0,
        timeToHorizon: 10,
      });
      expect(rZeroVol).toBe(0.50);

      const rNegTau = calculateReservationPrice({
        midPrice: 0.50,
        inventory: 100,
        gamma: 0.1,
        sigma: 0.05,
        timeToHorizon: -5,
      });
      expect(rNegTau).toBe(0.50);
    });

    it('handles non-positive gamma and kappa gracefully', () => {
      expect(calculateOptimalSpreadBase(0, 1.5)).toBe(0.02);
      expect(calculateOptimalSpreadBase(0.1, 0)).toBe(0.02);
    });

    it('OrderBookNormalizer drops invalid, zero, negative, or NaN levels', () => {
      const normalLvl = OrderBookNormalizer.normalizeLevel('0.55', '100');
      expect(normalLvl).toEqual({ price: 0.55, size: 100 });

      expect(OrderBookNormalizer.normalizeLevel('0', '100')).toBeNull();
      expect(OrderBookNormalizer.normalizeLevel('-0.5', '100')).toBeNull();
      expect(OrderBookNormalizer.normalizeLevel('NaN', '100')).toBeNull();
      expect(OrderBookNormalizer.normalizeLevel('0.55', '0')).toBeNull();
      expect(OrderBookNormalizer.normalizeLevel('0.55', '-10')).toBeNull();
    });

    it('MultiAgentCoordinator handles empty agent pool and single-agent delegation', () => {
      const emptyCoord = new MultiAgentCoordinator([]);
      expect(emptyCoord.coordinate(sampleObservation)).toBeNull();

      const singleAgent = new AdaptiveQuotingAgent(sampleConfig);
      const singleCoord = new MultiAgentCoordinator([singleAgent]);
      const res = singleCoord.coordinate(sampleObservation);
      expect(res).not.toBeNull();
      expect(res?.agentId).toBe(sampleConfig.agentId);
    });
  });

  // ─── 10. Remediation Verification: Contracts, Accounting & Guards ───────────────
  describe('10. Remediation Verification: Contracts, Accounting & Guards', () => {
    it('BaseQuotingAgent correctly calculates weighted-average cost basis on buys and accurate PnL on sells', () => {
      const agent = new AdaptiveQuotingAgent(sampleConfig);
      expect(agent.getInventory()).toBe(0);
      expect(agent.getCostBasis()).toBe(0);

      // Buy 1: 50 units @ 0.40, fee 0.02
      agent.onFill({
        fillId: 'f1', orderId: 'o1', agentId: sampleConfig.agentId,
        symbol: sampleConfig.symbol, venue: 'polymarket',
        side: 'buy', price: 0.40, amount: 50, fee: 0.02,
        liquidity: 'maker', timestamp: 1000,
      });
      expect(agent.getInventory()).toBe(50);
      expect(agent.getCostBasis()).toBeCloseTo(0.40, 4);
      expect(agent.getRealizedPnl()).toBeCloseTo(-0.02, 4);

      // Buy 2: 50 units @ 0.60, fee 0.02 -> weighted avg cost basis = (50*0.40 + 50*0.60)/100 = 0.50
      agent.onFill({
        fillId: 'f2', orderId: 'o2', agentId: sampleConfig.agentId,
        symbol: sampleConfig.symbol, venue: 'polymarket',
        side: 'buy', price: 0.60, amount: 50, fee: 0.02,
        liquidity: 'maker', timestamp: 2000,
      });
      expect(agent.getInventory()).toBe(100);
      expect(agent.getCostBasis()).toBeCloseTo(0.50, 4);
      expect(agent.getRealizedPnl()).toBeCloseTo(-0.04, 4);

      // Sell 1: Partial unwind 50 units @ 0.70, fee 0.03
      // Realized delta = (50 * 0.70 - 0.03) - (0.50 * 50) = 34.97 - 25.00 = +9.97
      // Total realized = -0.04 + 9.97 = +9.93
      agent.onFill({
        fillId: 'f3', orderId: 'o3', agentId: sampleConfig.agentId,
        symbol: sampleConfig.symbol, venue: 'polymarket',
        side: 'sell', price: 0.70, amount: 50, fee: 0.03,
        liquidity: 'maker', timestamp: 3000,
      });
      expect(agent.getInventory()).toBe(50);
      expect(agent.getCostBasis()).toBeCloseTo(0.50, 4);
      expect(agent.getRealizedPnl()).toBeCloseTo(9.93, 4);

      // Sell 2: Full close remaining 50 units @ 0.70, fee 0.02
      // Realized delta = (50 * 0.70 - 0.02) - (0.50 * 50) = 34.98 - 25.00 = +9.98
      // Total realized = 9.93 + 9.98 = +19.91
      agent.onFill({
        fillId: 'f4', orderId: 'o4', agentId: sampleConfig.agentId,
        symbol: sampleConfig.symbol, venue: 'polymarket',
        side: 'sell', price: 0.70, amount: 50, fee: 0.02,
        liquidity: 'maker', timestamp: 4000,
      });
      expect(agent.getInventory()).toBe(0);
      expect(agent.getCostBasis()).toBe(0);
      expect(agent.getRealizedPnl()).toBeCloseTo(19.91, 4);
      expect(agent.getCashBalance()).toBeCloseTo(agent.getRealizedPnl(), 4);
    });

    it('BaseQuotingAgent reports negative realized PnL on losing trades and breakeven trades', () => {
      const agent = new AdaptiveQuotingAgent(sampleConfig);
      agent.onFill({
        fillId: 'f1', orderId: 'o1', agentId: sampleConfig.agentId,
        symbol: sampleConfig.symbol, venue: 'polymarket',
        side: 'buy', price: 0.50, amount: 100, fee: 0.05,
        liquidity: 'maker', timestamp: 1000,
      });
      agent.onFill({
        fillId: 'f2', orderId: 'o2', agentId: sampleConfig.agentId,
        symbol: sampleConfig.symbol, venue: 'polymarket',
        side: 'sell', price: 0.40, amount: 100, fee: 0.05,
        liquidity: 'maker', timestamp: 2000,
      });
      expect(agent.getInventory()).toBe(0);
      expect(agent.getRealizedPnl()).toBeCloseTo(-10.10, 4);
      expect(agent.getCashBalance()).toBeCloseTo(-10.10, 4);
    });

    it('AdaptiveQuotingAgent sanitizes NaN and Infinite orderBookImbalance to prevent NaN quotes', () => {
      const agent = new AdaptiveQuotingAgent(sampleConfig);
      for (const badImbalance of [NaN, Infinity, -Infinity, undefined as unknown as number]) {
        const quote = agent.computeQuote({
          ...sampleObservation,
          orderBookImbalance: badImbalance,
        });
        expect(Number.isFinite(quote.bidPrice)).toBe(true);
        expect(Number.isFinite(quote.askPrice)).toBe(true);
        expect(Number.isFinite(quote.bidSpread)).toBe(true);
        expect(Number.isFinite(quote.askSpread)).toBe(true);
        expect(Number.isFinite(quote.confidence)).toBe(true);
        expect(quote.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(quote.askPrice).toBeLessThanOrEqual(0.99);
        expect(quote.askPrice).toBeGreaterThan(quote.bidPrice);
        expect(quote.metadata?.imbalance).toBe(0);
      }
    });

    it('InventorySkewAgent handles maxInventory <= 0 safely without NaN or zero division', () => {
      for (const invalidMax of [0, -10, -1000, NaN]) {
        const agent = new InventorySkewAgent({
          ...sampleConfig,
          maxInventory: invalidMax,
        });
        agent.setInventory(50);
        const quote = agent.computeQuote(sampleObservation);
        expect(Number.isFinite(quote.bidPrice)).toBe(true);
        expect(Number.isFinite(quote.askPrice)).toBe(true);
        expect(Number.isFinite(quote.bidSpread)).toBe(true);
        expect(Number.isFinite(quote.askSpread)).toBe(true);
        expect(Number.isFinite(quote.confidence)).toBe(true);
        expect(quote.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(quote.askPrice).toBeLessThanOrEqual(0.99);
        expect(quote.askPrice).toBeGreaterThan(quote.bidPrice);
      }
    });

    it('exports AvellanedaStoikovParams and QuoteCalculationResult contracts and works with AvellanedaStoikovModel', () => {
      const params: AvellanedaStoikovParams = {
        gamma: 0.1,
        kappa: 1.5,
        sigma: 0.02,
        terminalHorizonSec: 86400,
        tickSize: 0.01,
        minSpread: 0.02,
        maxSpread: 0.20,
      };
      const model = new AvellanedaStoikovModel(params);
      const quotes: QuoteCalculationResult = model.getQuotes(0.50, 0, 1.0);
      expect(quotes.reservationPrice).toBe(0.50);
      expect(quotes.bidPrice).toBeLessThan(0.50);
      expect(quotes.askPrice).toBeGreaterThan(0.50);
      expect(quotes.totalSpread).toBeGreaterThanOrEqual(0.02);
    });

    it('routes coordinated fills strictly to the winning agent under best_quote without duplication', () => {
      const agentA = new AdaptiveQuotingAgent({ ...sampleConfig, agentId: 'agent-A', weight: 1.0 });
      const agentB = new InventorySkewAgent({ ...sampleConfig, agentId: 'agent-B', weight: 1.0 });
      const coord = new MultiAgentCoordinator([agentA, agentB]);

      agentB.setInventory(800);
      const proposal = coord.coordinate(sampleObservation, 'best_quote');
      expect(proposal).not.toBeNull();
      expect(coord.lastBestBidAgentId).toBe('agent-A');
      expect(coord.lastBestAskAgentId).toBe('agent-B');

      coord.dispatchFill({
        fillId: 'f-1',
        orderId: 'o-1',
        agentId: 'coordinator:best_quote',
        symbol: sampleObservation.symbol,
        venue: sampleObservation.venue,
        side: 'buy',
        price: proposal!.bidPrice,
        amount: 100,
        fee: 0.10,
        liquidity: 'maker',
        timestamp: Date.now(),
      });

      expect(agentA.getInventory()).toBe(100);
      expect(agentB.getInventory()).toBe(800);

      coord.dispatchFill({
        fillId: 'f-2',
        orderId: 'o-2',
        agentId: 'coordinator:best_quote',
        symbol: sampleObservation.symbol,
        venue: sampleObservation.venue,
        side: 'sell',
        price: proposal!.askPrice,
        amount: 100,
        fee: 0.10,
        liquidity: 'maker',
        timestamp: Date.now(),
      });

      expect(agentA.getInventory()).toBe(100);
      expect(agentB.getInventory()).toBe(700);
    });

    it('distributes ambiguous fills proportionally across agents instead of broadcasting full amount', () => {
      const agentA = new AdaptiveQuotingAgent({ ...sampleConfig, agentId: 'agent-A', weight: 1.0 });
      const agentB = new AdaptiveQuotingAgent({ ...sampleConfig, agentId: 'agent-B', weight: 3.0 });
      const coord = new MultiAgentCoordinator([agentA, agentB]);

      coord.dispatchFill({
        fillId: 'f-ambig',
        orderId: 'o-ambig',
        agentId: 'coordinator:weighted_average',
        symbol: sampleObservation.symbol,
        venue: sampleObservation.venue,
        side: 'buy',
        price: 0.50,
        amount: 100,
        fee: 0.40,
        liquidity: 'maker',
        timestamp: Date.now(),
      });

      expect(agentA.getInventory()).toBe(25);
      expect(agentB.getInventory()).toBe(75);
      expect(agentA.getInventory() + agentB.getInventory()).toBe(100);
    });

    it('safely clamps non-crossing prices to 0.99 ceiling in best_quote aggregation', () => {
      const agentA = new AdaptiveQuotingAgent({ ...sampleConfig, agentId: 'agent-A' });
      const coord = new MultiAgentCoordinator([agentA]);
      const obsExtreme: AgentObservation = { ...sampleObservation, midPrice: 0.985, bestBid: 0.98, bestAsk: 0.99 };
      const prop = coord.coordinate(obsExtreme, 'best_quote');
      expect(prop!.askPrice).toBeLessThanOrEqual(0.99);
      expect(prop!.bidPrice).toBeLessThan(prop!.askPrice);
    });
  });
});

