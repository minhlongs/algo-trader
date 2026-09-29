/**
 * Adversarial Challenger Stress Test Suite for Milestone 1: MARL Quoting Models & Agents.
 * Rigorously stress-tests:
 * 1. Extreme inventories (q -> infinity, q -> -infinity): clamps [0.01, 0.99], non-crossing guarantees.
 * 2. Extreme volatilities (sigma -> 0, sigma = 5.0, sigma -> infinity): spread floors/caps, zero NaN/negatives.
 * 3. Terminal time horizon expiration (tau = T - t -> 0, tau < 0): inventory sensitivity decay.
 * 4. Poisson arrival intensity & queue decay with zero and massive queue sizes.
 * 5. 10,000-sample randomized fuzzing oracle over parameter space.
 * 6. Multi-agent coordination and environment replay under stress.
 */

import { describe, it, expect } from 'vitest';
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
import { MarketReplayConfigSchema } from '../../../src/desk/marl/types/marl-config-types';
import type { MarlAgentConfig, AgentObservation } from '../../../src/desk/marl/types/marl-types';

describe('Adversarial Challenger Verification: Milestone 1 Quoting & Agents', () => {
  const baseConfig: MarlAgentConfig = {
    agentId: 'test-agent',
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

  const createObs = (overrides: Partial<AgentObservation> = {}): AgentObservation => ({
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
    ...overrides,
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHALLENGE 1: Extreme Inventories (q -> +/- infinity)
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Challenge 1: Extreme Inventories (q -> +/- infinity)', () => {
    const extremeInventories = [
      100, 1_000, 10_000, 100_000, 1_000_000, 100_000_000, 1e12, 1e15,
      -100, -1_000, -10_000, -100_000, -1_000_000, -100_000_000, -1e12, -1e15,
    ];

    it('clamps quotes to [0.01, 0.99] across all extreme inventory values', () => {
      for (const q of extremeInventories) {
        for (const mid of [0.02, 0.10, 0.50, 0.90, 0.98]) {
          const quotes = calculateOptimalQuotes({
            midPrice: mid,
            inventory: q,
            gamma: 0.1,
            kappa: 1.5,
            sigma: 0.2,
            timeToHorizon: 100,
            tickSize: 0.01,
            minPrice: 0.01,
            maxPrice: 0.99,
          });

          expect(quotes.bidPrice).toBeGreaterThanOrEqual(0.01);
          expect(quotes.askPrice).toBeLessThanOrEqual(0.99);
          expect(Number.isFinite(quotes.bidPrice)).toBe(true);
          expect(Number.isFinite(quotes.askPrice)).toBe(true);
          expect(Number.isNaN(quotes.bidPrice)).toBe(false);
          expect(Number.isNaN(quotes.askPrice)).toBe(false);
        }
      }
    });

    it('strictly maintains non-crossing guarantee (askPrice >= bidPrice + tickSize) for all extreme q', () => {
      for (const q of extremeInventories) {
        for (const mid of [0.01, 0.02, 0.50, 0.98, 0.99]) {
          const quotes = calculateOptimalQuotes({
            midPrice: mid,
            inventory: q,
            gamma: 0.5,
            kappa: 2.0,
            sigma: 0.5,
            timeToHorizon: 1000,
            tickSize: 0.01,
            minPrice: 0.01,
            maxPrice: 0.99,
          });

          expect(quotes.askPrice).toBeGreaterThan(quotes.bidPrice);
          expect(quotes.askPrice - quotes.bidPrice).toBeGreaterThanOrEqual(0.01);
        }
      }
    });

    it('AdaptiveQuotingAgent safely clamps quotes and sizes under extreme inventory', () => {
      const agent = new AdaptiveQuotingAgent(baseConfig);
      for (const q of extremeInventories) {
        agent.setInventory(q);
        const proposal = agent.computeQuote(createObs());

        expect(proposal.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(proposal.askPrice).toBeLessThanOrEqual(0.99);
        expect(proposal.askPrice).toBeGreaterThan(proposal.bidPrice);
        expect(proposal.bidSize).toBeGreaterThanOrEqual(0);
        expect(proposal.askSize).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(proposal.confidence)).toBe(true);
      }
    });

    it('InventorySkewAgent correctly trips ASK_ONLY on massive long q and BID_ONLY on massive short q', () => {
      const agent = new InventorySkewAgent(baseConfig, 2.0, 0.8);

      // Huge positive inventory
      agent.setInventory(1e6);
      const quoteLong = agent.computeQuote(createObs());
      expect(quoteLong.metadata?.mode).toBe('ASK_ONLY');
      expect(quoteLong.bidSize).toBe(0);
      expect(quoteLong.askSize).toBeGreaterThan(0);
      expect(quoteLong.askPrice).toBeLessThanOrEqual(0.99);
      expect(quoteLong.bidPrice).toBe(0.01);
      expect(quoteLong.askPrice).toBeGreaterThan(quoteLong.bidPrice);

      // Huge negative inventory
      agent.setInventory(-1e6);
      const quoteShort = agent.computeQuote(createObs());
      expect(quoteShort.metadata?.mode).toBe('BID_ONLY');
      expect(quoteShort.askSize).toBe(0);
      expect(quoteShort.bidSize).toBeGreaterThan(0);
      expect(quoteShort.bidPrice).toBeGreaterThanOrEqual(0.01);
      expect(quoteShort.askPrice).toBe(0.99);
      expect(quoteShort.askPrice).toBeGreaterThan(quoteShort.bidPrice);
    });

    it('MultiAgentCoordinator aggregates safely under extreme inventory across all modes', () => {
      const adaptive = new AdaptiveQuotingAgent({ ...baseConfig, agentId: 'adaptive-skewed' });
      const skew = new InventorySkewAgent({ ...baseConfig, agentId: 'skew-skewed' });
      adaptive.setInventory(500_000);
      skew.setInventory(500_000);

      const coord = new MultiAgentCoordinator([adaptive, skew]);
      const obs = createObs({ midPrice: 0.50 });

      for (const mode of ['best_quote', 'weighted_average', 'consensus'] as const) {
        const aggregated = coord.coordinate(obs, mode);
        expect(aggregated).not.toBeNull();
        expect(aggregated!.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(aggregated!.askPrice).toBeLessThanOrEqual(0.99);
        expect(aggregated!.askPrice).toBeGreaterThan(aggregated!.bidPrice);
        expect(Number.isFinite(aggregated!.bidPrice)).toBe(true);
        expect(Number.isFinite(aggregated!.askPrice)).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHALLENGE 2: Extreme Volatilities (sigma -> 0, sigma = 5.0, sigma -> inf)
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Challenge 2: Extreme Volatilities (sigma -> 0, sigma = 5.0, sigma -> inf)', () => {
    const extremeSigmas = [0, 1e-12, 1e-6, 0.0001, 0.01, 0.1, 1.0, 5.0, 20.0, 100.0, 1000.0];

    it('handles zero and near-zero volatility without NaN, negative spreads, or collapse', () => {
      for (const sigma of [0, 1e-15, 1e-9, 1e-4]) {
        const quotes = calculateOptimalQuotes({
          midPrice: 0.50,
          inventory: 10,
          gamma: 0.1,
          kappa: 1.5,
          sigma,
          timeToHorizon: 100,
          tickSize: 0.01,
          minSpread: 0.02,
          maxSpread: 0.20,
        });

        expect(Number.isNaN(quotes.reservationPrice)).toBe(false);
        expect(Number.isNaN(quotes.bidPrice)).toBe(false);
        expect(Number.isNaN(quotes.askPrice)).toBe(false);
        expect(quotes.totalSpread).toBeGreaterThanOrEqual(0.02);
        expect(quotes.totalSpread).toBeLessThanOrEqual(0.20);
        expect(quotes.askPrice).toBeGreaterThan(quotes.bidPrice);
      }
    });

    it('handles hyper-volatility (sigma = 5.0 to 1000.0) safely clamped to [minSpread, maxSpread] & [0.01, 0.99]', () => {
      for (const sigma of [5.0, 10.0, 50.0, 100.0, 1000.0]) {
        const quotes = calculateOptimalQuotes({
          midPrice: 0.50,
          inventory: 5,
          gamma: 0.1,
          kappa: 1.5,
          sigma,
          timeToHorizon: 10,
          tickSize: 0.01,
          minSpread: 0.02,
          maxSpread: 0.20,
        });

        expect(Number.isFinite(quotes.bidPrice)).toBe(true);
        expect(Number.isFinite(quotes.askPrice)).toBe(true);
        expect(quotes.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(quotes.askPrice).toBeLessThanOrEqual(0.99);
        expect(quotes.askPrice).toBeGreaterThan(quotes.bidPrice);
      }
    });

    it('RollingVolatilityEstimator floors at defaultVol when realized volatility is 0', () => {
      const estimator = new RollingVolatilityEstimator(20, 0.02);
      // Push identical prices
      for (let i = 0; i < 30; i++) {
        estimator.update(0.50);
      }
      expect(estimator.getVolatility()).toBe(0.02); // Floors at defaultVol, avoids zero-vol collapse
    });

    it('RollingVolatilityEstimator handles massive volatility price swings without NaN', () => {
      const estimator = new RollingVolatilityEstimator(20, 0.02);
      for (let i = 0; i < 30; i++) {
        estimator.update(i % 2 === 0 ? 0.05 : 0.95);
      }
      const vol = estimator.getVolatility();
      expect(Number.isFinite(vol)).toBe(true);
      expect(vol).toBeGreaterThan(1.0);
      expect(Number.isNaN(vol)).toBe(false);
    });

    it('Parkinson volatility handles degenerate intervals (high == low) and extreme intervals', () => {
      // Degenerate (no range)
      const degenerate = [{ high: 0.50, low: 0.50 }, { high: 0.50, low: 0.50 }];
      expect(calculateParkinsonVolatility(degenerate)).toBe(0);

      // Extreme range (high >> low)
      const extreme = [{ high: 10.0, low: 0.01 }, { high: 12.0, low: 0.02 }];
      const pVol = calculateParkinsonVolatility(extreme);
      expect(Number.isFinite(pVol)).toBe(true);
      expect(pVol).toBeGreaterThan(0);
      expect(Number.isNaN(pVol)).toBe(false);

      // Invalid inputs
      expect(calculateParkinsonVolatility([{ high: -1, low: 2 }])).toBe(0);
      expect(calculateParkinsonVolatility([{ high: 0.5, low: 0.6 }])).toBe(0); // high < low
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHALLENGE 3: Terminal Time Horizon Expiration (tau = T - t -> 0, tau < 0)
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Challenge 3: Terminal Time Horizon Expiration (tau = T - t -> 0, tau < 0)', () => {
    it('verifies inventory sensitivity dr/dq -> 0 as tau -> 0', () => {
      const midPrice = 0.50;
      const gamma = 0.2;
      const sigma = 0.3;

      // At long horizon tau = 100, sensitivity to q is high
      const r1_long = calculateReservationPrice({ midPrice, inventory: 10, gamma, sigma, timeToHorizon: 100 });
      const r2_long = calculateReservationPrice({ midPrice, inventory: 20, gamma, sigma, timeToHorizon: 100 });
      const sensitivityLong = Math.abs(r2_long - r1_long);
      expect(sensitivityLong).toBeCloseTo(10 * gamma * Math.pow(sigma, 2) * 100, 4);

      // At near-expiration tau = 1e-4, sensitivity to q is negligible
      const r1_exp = calculateReservationPrice({ midPrice, inventory: 10, gamma, sigma, timeToHorizon: 1e-4 });
      const r2_exp = calculateReservationPrice({ midPrice, inventory: 20, gamma, sigma, timeToHorizon: 1e-4 });
      const sensitivityExp = Math.abs(r2_exp - r1_exp);
      expect(sensitivityExp).toBeLessThan(0.001);

      // At exact expiration tau = 0, reservation price equals midPrice regardless of inventory
      const rZeroLong = calculateReservationPrice({ midPrice, inventory: 1000, gamma, sigma, timeToHorizon: 0 });
      const rZeroShort = calculateReservationPrice({ midPrice, inventory: -1000, gamma, sigma, timeToHorizon: 0 });
      expect(rZeroLong).toBe(midPrice);
      expect(rZeroShort).toBe(midPrice);
    });

    it('safely clamps negative tau (time past expiration) to tau = 0', () => {
      for (const negativeTau of [-0.001, -1, -60, -86400]) {
        const r = calculateReservationPrice({
          midPrice: 0.50,
          inventory: 50,
          gamma: 0.1,
          sigma: 0.2,
          timeToHorizon: negativeTau,
        });
        expect(r).toBe(0.50);

        const quotes = calculateOptimalQuotes({
          midPrice: 0.50,
          inventory: 50,
          gamma: 0.1,
          kappa: 1.5,
          sigma: 0.2,
          timeToHorizon: negativeTau,
        });
        expect(quotes.reservationPrice).toBe(0.50);
        expect(quotes.bidPrice).toBeLessThan(0.50);
        expect(quotes.askPrice).toBeGreaterThan(0.50);
        expect(quotes.askPrice).toBeGreaterThan(quotes.bidPrice);
      }
    });

    it('at tau = 0, optimal quotes remain strictly symmetric around midPrice when within spread bounds', () => {
      const quotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 100, // Even with large inventory!
        gamma: 0.1,
        kappa: 1.5,
        sigma: 0.2,
        timeToHorizon: 0,
        tickSize: 0.01,
        minSpread: 0.04,
      });

      // Spreads are symmetric
      expect(quotes.bidSpread).toBeCloseTo(quotes.askSpread, 3);
      expect(quotes.totalSpread).toBeGreaterThanOrEqual(0.04);
      expect(quotes.askPrice).toBeGreaterThan(quotes.bidPrice);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHALLENGE 4: Poisson Arrival Intensity & Queue Decay (Zero & Massive Queues)
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Challenge 4: Poisson Arrival Intensity & Queue Decay', () => {
    it('calculates arrival intensity across extreme spread distances and decay parameters', () => {
      const params = { baselineArrivalRate: 10.0, kappa: 2.0 };

      // At spreadDistance = 0 (at the mid), intensity = baselineArrivalRate
      expect(calculateArrivalIntensity(0, params)).toBe(10.0);

      // Negative spreadDistance clamped to 0
      expect(calculateArrivalIntensity(-0.05, params)).toBe(10.0);

      // Huge spread distance decays to near zero
      const farIntensity = calculateArrivalIntensity(100.0, params);
      expect(farIntensity).toBeLessThan(1e-10);
      expect(farIntensity).toBeGreaterThanOrEqual(0);

      // Degenerate parameters
      expect(calculateArrivalIntensity(0.01, { baselineArrivalRate: 0, kappa: 1.5 })).toBe(0);
      expect(calculateArrivalIntensity(0.01, { baselineArrivalRate: -5, kappa: 1.5 })).toBe(0);
      expect(calculateArrivalIntensity(0.01, { baselineArrivalRate: 10, kappa: 0 })).toBe(10.0);
    });

    it('fill probability is strictly bounded in [0, 1] across extreme queue sizes and times', () => {
      const queueSizes = [0, 1, 10, 100, 1_000, 100_000, 1e7, 1e12, 1e16, -100];
      const timeSteps = [0, 1e-6, 0.1, 1.0, 60.0, 86400, 1e9, -5];

      for (const q of queueSizes) {
        for (const dt of timeSteps) {
          const prob = calculateFillProbability({
            spreadDistance: 0.01,
            baselineArrivalRate: 5.0,
            kappa: 1.5,
            timeDeltaSec: dt,
            queueAhead: q,
            typicalLevelVolume: 100,
          });

          expect(prob).toBeGreaterThanOrEqual(0);
          expect(prob).toBeLessThanOrEqual(1.0);
          expect(Number.isFinite(prob)).toBe(true);
          expect(Number.isNaN(prob)).toBe(false);
        }
      }
    });

    it('queue decay is strictly monotonically non-increasing as queueAhead increases', () => {
      const baseParams = {
        spreadDistance: 0.01,
        baselineArrivalRate: 5.0,
        kappa: 1.5,
        timeDeltaSec: 1.0,
        typicalLevelVolume: 100,
      };

      let prevProb = calculateFillProbability({ ...baseParams, queueAhead: 0 });
      for (const q of [10, 50, 100, 500, 1000, 5000, 10000, 100000]) {
        const currProb = calculateFillProbability({ ...baseParams, queueAhead: q });
        expect(currProb).toBeLessThanOrEqual(prevProb);
        prevProb = currProb;
      }
    });

    it('handles zero or negative typicalLevelVolume safely without zero division', () => {
      const probZeroVol = calculateFillProbability({
        spreadDistance: 0.01,
        baselineArrivalRate: 5.0,
        kappa: 1.5,
        timeDeltaSec: 1.0,
        queueAhead: 100,
        typicalLevelVolume: 0, // Math.max(1, 0) prevents div by 0
      });
      expect(Number.isFinite(probZeroVol)).toBe(true);
      expect(probZeroVol).toBeGreaterThan(0);
      expect(probZeroVol).toBeLessThanOrEqual(1.0);

      const probNegVol = calculateFillProbability({
        spreadDistance: 0.01,
        baselineArrivalRate: 5.0,
        kappa: 1.5,
        timeDeltaSec: 1.0,
        queueAhead: 100,
        typicalLevelVolume: -50,
      });
      expect(Number.isFinite(probNegVol)).toBe(true);
    });

    it('expected fill time returns Infinity on 0 intensity and finite positive number otherwise', () => {
      expect(calculateExpectedFillTime(0.01, { baselineArrivalRate: 0, kappa: 1.5 })).toBe(Number.POSITIVE_INFINITY);
      expect(calculateExpectedFillTime(1000, { baselineArrivalRate: 1, kappa: 100 })).toBe(Number.POSITIVE_INFINITY);

      const t = calculateExpectedFillTime(0.01, { baselineArrivalRate: 5.0, kappa: 1.5 });
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHALLENGE 5: 10,000-Sample Randomized Fuzzing Oracle (Property-Based Stress)
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Challenge 5: 10,000-Sample Randomized Fuzzing Oracle', () => {
    it('satisfies all market-making invariants over 10,000 randomized parameter vectors', () => {
      // Seeded deterministic LCG for 100% reproducible fuzzing
      let seed = 123456789;
      const rnd = (): number => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const SAMPLES = 10_000;
      let clampedCount = 0;

      for (let i = 0; i < SAMPLES; i++) {
        const midPrice = 0.01 + rnd() * 0.98; // [0.01, 0.99]
        const inventory = (rnd() - 0.5) * 20_000; // [-10000, 10000]
        const gamma = 0.001 + rnd() * 5.0;
        const kappa = 0.1 + rnd() * 10.0;
        const sigma = rnd() * 3.0; // [0, 3.0]
        const timeToHorizon = rnd() * 86400; // [0, 1 day]
        const tickSize = rnd() > 0.5 ? 0.01 : 0.001;
        const minSpread = 0.01 + rnd() * 0.04;
        const maxSpread = 0.06 + rnd() * 0.20;

        const res = calculateOptimalQuotes({
          midPrice,
          inventory,
          gamma,
          kappa,
          sigma,
          timeToHorizon,
          tickSize,
          minSpread,
          maxSpread,
          minPrice: 0.01,
          maxPrice: 0.99,
        });

        if (res.clamped) clampedCount++;

        // INVARIANT 1: No NaN or non-finite values
        expect(Number.isFinite(res.bidPrice)).toBe(true);
        expect(Number.isFinite(res.askPrice)).toBe(true);
        expect(Number.isFinite(res.reservationPrice)).toBe(true);
        expect(Number.isNaN(res.bidPrice)).toBe(false);
        expect(Number.isNaN(res.askPrice)).toBe(false);

        // INVARIANT 2: Strict boundary containment [0.01, 0.99]
        expect(res.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(res.askPrice).toBeLessThanOrEqual(0.99);

        // INVARIANT 3: Non-crossing guarantee (ask strictly exceeds bid by at least tickSize)
        expect(res.askPrice).toBeGreaterThan(res.bidPrice);
        expect(res.askPrice - res.bidPrice).toBeGreaterThanOrEqual(tickSize - 1e-6);

        // INVARIANT 4: Total spread is non-negative
        expect(res.totalSpread).toBeGreaterThan(0);
      }

      // Ensure that our fuzzer actually exercised the clamp branches
      expect(clampedCount).toBeGreaterThan(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // CHALLENGE 6: Environment Replay & Orderbook Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Challenge 6: Environment Replay & Orderbook Edge Cases', () => {
    it('MarketReplayEngine handles zero volatility without stalling or NaN', () => {
      const engine = new MarketReplayEngine({
        symbol: 'BTC-2026-YES',
        initialMidPrice: 0.50,
        stepCount: 20,
        timeStepSec: 1.0,
        volatility: 0,
        randomSeed: 777,
        tickSize: 0.01,
      });

      for (let i = 0; i < 20; i++) {
        const state = engine.step();
        expect(Number.isFinite(state.midPrice)).toBe(true);
        expect(state.midPrice).toBe(0.50); // Exact flat line
        expect(state.orderBook.bids.length).toBeGreaterThan(0);
        expect(state.orderBook.asks.length).toBeGreaterThan(0);
        expect(Number.isFinite(state.orderBook.bids[0]!.price)).toBe(true);
        expect(Number.isFinite(state.orderBook.asks[0]!.price)).toBe(true);
      }
    });

    it('MarketReplayEngine handles extreme volatility (sigma = 5.0) with prices clamped to [0.01, 0.99]', () => {
      const engine = new MarketReplayEngine({
        symbol: 'BTC-2026-YES',
        initialMidPrice: 0.50,
        stepCount: 50,
        timeStepSec: 1.0,
        volatility: 5.0,
        randomSeed: 888,
        tickSize: 0.01,
      });

      for (let i = 0; i < 50; i++) {
        const state = engine.step();
        expect(state.midPrice).toBeGreaterThanOrEqual(0.01);
        expect(state.midPrice).toBeLessThanOrEqual(0.99);
        expect(state.orderBook.bids[0]!.price).toBeGreaterThanOrEqual(0.01);
        expect(state.orderBook.asks[0]!.price).toBeLessThanOrEqual(0.99);
        expect(state.orderBook.asks[0]!.price).toBeGreaterThan(state.orderBook.bids[0]!.price);
      }
    });

    it('OrderBookNormalizer handles inverted or crossed raw orderbook safely', () => {
      // Crossed orderbook input from dirty feed: best bid 0.55 > best ask 0.50
      const crossedClob = {
        tokenId: 'CROSSED-1',
        bids: [{ price: '0.55', size: '100' }],
        asks: [{ price: '0.50', size: '100' }],
      };

      const book = OrderBookNormalizer.normalizeClob(crossedClob);
      expect(book.bids[0]!.price).toBe(0.55);
      expect(book.asks[0]!.price).toBe(0.50);

      const micro = OrderBookNormalizer.computeMicrostructure(book);
      expect(Number.isFinite(micro.midPrice)).toBe(true);
      expect(micro.midPrice).toBe(0.525);
    });

    it('verifies config schema defaults: raw config without tickSize automatically gets safe defaults and avoids NaN', () => {
      // Raw config missing tickSize is automatically parsed by MarketReplayConfigSchema in constructor
      const engine = new MarketReplayEngine({
        symbol: 'BTC-2026-YES',
        initialMidPrice: 0.50,
        stepCount: 2,
        timeStepSec: 1.0,
      });
      const state = engine.step();
      expect(Number.isFinite(state.orderBook.bids[0]!.price)).toBe(true);
      expect(state.orderBook.bids[0]!.price).toBeCloseTo(0.49, 1);
    });
  });
});
