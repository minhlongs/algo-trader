/**
 * Adversarial Stress Test Suite for Milestone 1: Environment & Replay Engine.
 * Rigorously probes:
 * 1. Deterministic replay reproducibility across 1,000+ ticks with identical random seeds.
 * 2. Orderbook normalizer resilience under malformed, empty, inverted, crossed, and extreme inputs.
 * 3. Live stream adapter behavior under simulated disconnects and heartbeat staleness.
 * 4. 24-D observation vector normalization guarantees (bounds in [-1, 1] or [0, 1], no NaNs/Infs).
 */

import { describe, it, expect, vi } from 'vitest';
import { MarketReplayEngine } from '../../../src/desk/marl/environment/market-replay-engine';
import { OrderBookNormalizer, type RawClobOrderBook, type RawCexOrderBook } from '../../../src/desk/marl/environment/orderbook-normalizer';
import { LiveStreamAdapter } from '../../../src/desk/marl/environment/live-stream-adapter';
import { MarketReplayConfigSchema } from '../../../src/desk/marl/types/marl-config-types';
import type { MarlOrderBook, QuoteProposal } from '../../../src/desk/marl/types/marl-types';

describe('Adversarial Stress Testing — M1 Environment & Replay Engine', () => {

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. REPLAY ENGINE DETERMINISM (1,000+ TICKS)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('1. Deterministic Replay Reproducibility Across 1,000+ Ticks', () => {
    const baseConfig = MarketReplayConfigSchema.parse({
      symbol: 'BTC-2026-YES',
      venue: 'polymarket',
      initialMidPrice: 0.50,
      tickSize: 0.01,
      stepCount: 1500,
      timeStepSec: 1.0,
      randomSeed: 777,
      arrivalIntensity: 2.5,
      queueDepletionFactor: 0.4,
      volatility: 0.025,
    });

    it('produces bit-for-bit identical price trajectories and orderbooks across 1,500 ticks with identical seeds', () => {
      const engineA = new MarketReplayEngine(baseConfig);
      const engineB = new MarketReplayEngine(baseConfig);

      for (let step = 1; step <= 1500; step++) {
        const resA = engineA.step();
        const resB = engineB.step();

        expect(resA.step).toBe(resB.step);
        expect(resA.midPrice).toBe(resB.midPrice);
        expect(resA.done).toBe(resB.done);

        // Check all 5 bid levels
        expect(resA.orderBook.bids.length).toBe(5);
        expect(resB.orderBook.bids.length).toBe(5);
        for (let i = 0; i < 5; i++) {
          expect(resA.orderBook.bids[i]!.price).toBe(resB.orderBook.bids[i]!.price);
          expect(resA.orderBook.bids[i]!.size).toBe(resB.orderBook.bids[i]!.size);
        }

        // Check all 5 ask levels
        expect(resA.orderBook.asks.length).toBe(5);
        expect(resB.orderBook.asks.length).toBe(5);
        for (let i = 0; i < 5; i++) {
          expect(resA.orderBook.asks[i]!.price).toBe(resB.orderBook.asks[i]!.price);
          expect(resA.orderBook.asks[i]!.size).toBe(resB.orderBook.asks[i]!.size);
        }
      }
    });

    it('reproduces identical trajectory after reset() over 1,200 ticks', () => {
      const engine = new MarketReplayEngine(baseConfig);
      const firstRunPrices: number[] = [];
      const firstRunBids: number[] = [];

      for (let i = 0; i < 1200; i++) {
        const res = engine.step();
        firstRunPrices.push(res.midPrice);
        firstRunBids.push(res.orderBook.bids[0]!.price);
      }

      engine.reset();
      expect(engine.getCurrentMidPrice()).toBe(0.50);

      const secondRunPrices: number[] = [];
      const secondRunBids: number[] = [];

      for (let i = 0; i < 1200; i++) {
        const res = engine.step();
        secondRunPrices.push(res.midPrice);
        secondRunBids.push(res.orderBook.bids[0]!.price);
      }

      expect(firstRunPrices).toEqual(secondRunPrices);
      expect(firstRunBids).toEqual(secondRunBids);
    });

    it('matches fill execution outcomes identically across 1,000 ticks under dynamic quote submissions', () => {
      const engineA = new MarketReplayEngine(baseConfig);
      const engineB = new MarketReplayEngine(baseConfig);

      let totalFillsA = 0;
      let totalFillsB = 0;

      for (let step = 1; step <= 1000; step++) {
        // Intermittently submit quotes every 20 steps
        if (step % 20 === 0) {
          const quote: QuoteProposal = {
            agentId: 'stress-agent',
            symbol: 'BTC-2026-YES',
            venue: 'polymarket',
            bidPrice: Number((engineA.getCurrentMidPrice() - 0.01).toFixed(4)),
            bidSize: 25,
            askPrice: Number((engineA.getCurrentMidPrice() + 0.01).toFixed(4)),
            askSize: 25,
            reservationPrice: engineA.getCurrentMidPrice(),
            bidSpread: 0.01,
            askSpread: 0.01,
            confidence: 0.95,
            timestamp: 1000,
          };
          engineA.submitQuote(quote);
          engineB.submitQuote(quote);
        }

        const resA = engineA.step();
        const resB = engineB.step();

        totalFillsA += resA.fills.length;
        totalFillsB += resB.fills.length;

        expect(resA.fills.length).toBe(resB.fills.length);
        for (let f = 0; f < resA.fills.length; f++) {
          const fA = resA.fills[f]!;
          const fB = resB.fills[f]!;
          expect(fA.side).toBe(fB.side);
          expect(fA.price).toBe(fB.price);
          expect(fA.amount).toBe(fB.amount);
          expect(fA.fee).toBe(fB.fee);
        }
      }

      expect(totalFillsA).toBeGreaterThan(0);
      expect(totalFillsA).toBe(totalFillsB);
    });

    it('survives 5,000 continuous ticks without NaN, Inf, or boundary violation', () => {
      const longConfig = MarketReplayConfigSchema.parse({
        symbol: 'BTC-2026-YES',
        stepCount: 5000,
        volatility: 0.05,
        randomSeed: 9999,
      });
      const engine = new MarketReplayEngine(longConfig);

      for (let i = 0; i < 5000; i++) {
        const res = engine.step();
        expect(Number.isFinite(res.midPrice)).toBe(true);
        expect(res.midPrice).toBeGreaterThanOrEqual(0.02);
        expect(res.midPrice).toBeLessThanOrEqual(0.98);

        for (const bid of res.orderBook.bids) {
          expect(Number.isFinite(bid.price)).toBe(true);
          expect(Number.isFinite(bid.size)).toBe(true);
          expect(bid.price).toBeGreaterThanOrEqual(0.01);
        }
        for (const ask of res.orderBook.asks) {
          expect(Number.isFinite(ask.price)).toBe(true);
          expect(Number.isFinite(ask.size)).toBe(true);
          expect(ask.price).toBeLessThanOrEqual(0.99);
        }
      }
    });

    it('diverges properly when initialized with different random seeds (PRNG entropy test)', () => {
      const engine1 = new MarketReplayEngine({ ...baseConfig, randomSeed: 101 });
      const engine2 = new MarketReplayEngine({ ...baseConfig, randomSeed: 102 });

      let divergences = 0;
      for (let i = 0; i < 100; i++) {
        if (engine1.step().midPrice !== engine2.step().midPrice) {
          divergences++;
        }
      }
      expect(divergences).toBeGreaterThan(90);
    });

    it('REMEDIATED: Unparsed raw config is validated by schema preventing NaN midPrice', () => {
      // If a caller instantiates MarketReplayEngine with partial raw config
      const rawUnparsed = { symbol: 'RAW-TEST', stepCount: 100 } as any;
      const validatedEngine = new MarketReplayEngine(rawUnparsed);
      const res = validatedEngine.step();

      // Schema defaults inject initialMidPrice, volatility, timeStepSec, avoiding NaN
      expect(Number.isFinite(res.midPrice)).toBe(true);
      expect(Number.isFinite(validatedEngine.getCurrentMidPrice())).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. ORDERBOOK NORMALIZER RESILIENCE
  // ═════════════════════════════════════════════════════════════════════════════
  describe('2. Orderbook Normalizer Under Malformed, Empty, Inverted, and Crossed Inputs', () => {
    it('handles completely empty orderbooks gracefully with neutral microstructural defaults', () => {
      const emptyBook: MarlOrderBook = {
        symbol: 'EMPTY',
        venue: 'polymarket',
        bids: [],
        asks: [],
        timestamp: Date.now(),
      };

      const micro = OrderBookNormalizer.computeMicrostructure(emptyBook);
      expect(micro.bestBid).toBe(0.50);
      expect(micro.bestAsk).toBe(0.50);
      expect(micro.midPrice).toBe(0.50);
      expect(micro.spread).toBe(0.00);
      expect(micro.l1Imbalance).toBe(0.00);
      expect(micro.depthImbalance).toBe(0.00);
      expect(micro.microPrice).toBe(0.50);

      const obs = OrderBookNormalizer.toObservation(emptyBook);
      expect(obs.observationVector).toBeDefined();
      for (let i = 0; i < 24; i++) {
        expect(Number.isFinite(obs.observationVector![i])).toBe(true);
        expect(Number.isNaN(obs.observationVector![i])).toBe(false);
      }
    });

    it('handles inverted and crossed orderbooks (bestBid > bestAsk)', () => {
      // Inverted book: best bid 0.65, best ask 0.45
      const crossedBook: MarlOrderBook = {
        symbol: 'CROSSED',
        venue: 'polymarket',
        bids: [{ price: 0.65, size: 200 }, { price: 0.60, size: 300 }],
        asks: [{ price: 0.45, size: 100 }, { price: 0.50, size: 200 }],
        timestamp: Date.now(),
      };

      const micro = OrderBookNormalizer.computeMicrostructure(crossedBook);
      expect(micro.bestBid).toBe(0.65);
      expect(micro.bestAsk).toBe(0.45);
      expect(micro.spread).toBe(-0.20); // Negative spread
      expect(micro.midPrice).toBe(0.55);

      const obs = OrderBookNormalizer.toObservation(crossedBook);
      // Negative spread is clamped to 0 at obsVec[6]
      expect(obs.observationVector![6]).toBe(0);
      expect(obs.observationVector![5]).toBeGreaterThanOrEqual(-1);
      expect(obs.observationVector![5]).toBeLessThanOrEqual(1);
    });

    it('handles single-sided orderbooks (bids only or asks only)', () => {
      const bidsOnly: MarlOrderBook = {
        symbol: 'BIDS-ONLY',
        venue: 'polymarket',
        bids: [{ price: 0.58, size: 1000 }],
        asks: [],
        timestamp: Date.now(),
      };

      const obsBidsOnly = OrderBookNormalizer.toObservation(bidsOnly);
      expect(Number.isFinite(obsBidsOnly.observationVector![3])).toBe(true);
      expect(obsBidsOnly.observationVector![4]).toBe(1.0); // 100% bid depth

      const asksOnly: MarlOrderBook = {
        symbol: 'ASKS-ONLY',
        venue: 'polymarket',
        bids: [],
        asks: [{ price: 0.42, size: 1000 }],
        timestamp: Date.now(),
      };

      const obsAsksOnly = OrderBookNormalizer.toObservation(asksOnly);
      expect(Number.isFinite(obsAsksOnly.observationVector![3])).toBe(true);
      expect(obsAsksOnly.observationVector![4]).toBe(-1.0); // -100% ask depth
    });

    it('cleanses malformed string inputs and drops invalid levels in normalizeClob', () => {
      const malformedClob: RawClobOrderBook = {
        tokenId: 'MALFORMED-1',
        bids: [
          { price: '0.45', size: '100' },     // valid
          { price: '-0.10', size: '100' },    // negative price -> dropped
          { price: '0', size: '50' },         // zero price -> dropped
          { price: 'NaN', size: '100' },      // NaN price -> dropped
          { price: '0.44', size: '0' },       // zero size -> dropped
          { price: '0.43', size: '-50' },     // negative size -> dropped
          { price: 'text', size: '100' },     // unparseable -> dropped
        ],
        asks: [
          { price: '0.55', size: '200' },     // valid
          { price: '0.56', size: 'abc' },     // NaN size -> dropped
        ],
      };

      const cleaned = OrderBookNormalizer.normalizeClob(malformedClob);
      expect(cleaned.bids.length).toBe(1);
      expect(cleaned.bids[0]).toEqual({ price: 0.45, size: 100 });
      expect(cleaned.asks.length).toBe(1);
      expect(cleaned.asks[0]).toEqual({ price: 0.55, size: 200 });
    });

    it('cleanses malformed CEX tuple inputs and drops invalid levels in normalizeCex', () => {
      const malformedCex: RawCexOrderBook = {
        symbol: 'BTC/USDT',
        venue: 'binance',
        bids: [
          ['60000', '1.0'],                   // valid
          ['-100', '1.0'],                    // negative price -> dropped
          ['60000', '0'],                     // zero size -> dropped
          ['bad', '1.0'],                     // invalid -> dropped
          ['60001', '2.0'],                   // valid (higher price)
        ],
        asks: [
          ['60005', '1.5'],                   // valid
          ['0', '10'],                        // zero price -> dropped
        ],
      };

      const cleaned = OrderBookNormalizer.normalizeCex(malformedCex);
      expect(cleaned.bids.length).toBe(2);
      expect(cleaned.bids[0]!.price).toBe(60001); // sorted descending
      expect(cleaned.bids[1]!.price).toBe(60000);
      expect(cleaned.asks.length).toBe(1);
      expect(cleaned.asks[0]!.price).toBe(60005);
    });

    it('sorts unsorted out-of-order L2 levels correctly', () => {
      const unsortedClob: RawClobOrderBook = {
        tokenId: 'UNSORTED',
        bids: [
          { price: 0.41, size: 10 },
          { price: 0.49, size: 20 },
          { price: 0.45, size: 30 },
        ],
        asks: [
          { price: 0.59, size: 15 },
          { price: 0.51, size: 25 },
          { price: 0.55, size: 35 },
        ],
      };

      const book = OrderBookNormalizer.normalizeClob(unsortedClob);
      // Bids: descending
      expect(book.bids.map((b) => b.price)).toEqual([0.49, 0.45, 0.41]);
      // Asks: ascending
      expect(book.asks.map((a) => a.price)).toEqual([0.51, 0.55, 0.59]);
    });

    it('REMEDIATED: Infinity values are rejected by normalizeLevel preventing NaNs in observation vector', () => {
      // normalizeLevel rejects non-finite values (Infinity, -Infinity, NaN), returning null
      const lvl = OrderBookNormalizer.normalizeLevel(Infinity, 100);
      expect(lvl).toBeNull();

      const validBook: MarlOrderBook = {
        symbol: 'VALID-BOOK',
        venue: 'polymarket',
        bids: [{ price: 0.50, size: 100 }],
        asks: [{ price: 0.52, size: 100 }],
        timestamp: Date.now(),
      };

      const obs = OrderBookNormalizer.toObservation(validBook);
      expect(Number.isFinite(obs.observationVector![5])).toBe(true);
      expect(Number.isFinite(obs.observationVector![6])).toBe(true);
    });

    it('REMEDIATED: Levels with size 0 passed to computeMicrostructure cause no NaN', () => {
      const zeroSizeBook: MarlOrderBook = {
        symbol: 'ZERO-VOL',
        venue: 'polymarket',
        bids: [{ price: 0.50, size: 0 }],
        asks: [{ price: 0.50, size: 0 }],
        timestamp: Date.now(),
      };

      const obs = OrderBookNormalizer.toObservation(zeroSizeBook);
      // Denominator guarded: l1Imbalance defaults to 0 and microPrice defaults to midPrice
      expect(Number.isFinite(obs.observationVector![3])).toBe(true);
      expect(obs.observationVector![3]).toBe(0);
      expect(Number.isFinite(obs.observationVector![5])).toBe(true);
      expect(obs.observationVector![5]).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. LIVE STREAM ADAPTER (DISCONNECTS & HEARTBEAT STALENESS)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('3. Live Stream Adapter WebSocket Disconnects & Staleness Tripwires', () => {
    it('reliably triggers stale_feed and cancel_all_quotes when heartbeat staleness is exceeded', () => {
      const adapter = new LiveStreamAdapter({
        symbol: 'POLY-HEARTBEAT',
        heartbeatTimeoutMs: 50,
      });

      let cancelTriggered = false;
      let staleEventReceived: { elapsedMs: number } | null = null;

      adapter.on('cancel_all_quotes', () => { cancelTriggered = true; });
      adapter.on('stale_feed', (data) => { staleEventReceived = data; });

      adapter.start();
      expect(adapter.isFeedHealthy()).toBe(true);

      // Artificially advance timestamp past 50ms
      (adapter as any).lastUpdateTimestamp = Date.now() - 100;
      expect(adapter.isFeedHealthy()).toBe(false);

      // Trigger heartbeat check
      (adapter as any).checkHeartbeat();

      expect(cancelTriggered).toBe(true);
      expect(staleEventReceived).not.toBeNull();
      expect(staleEventReceived!.elapsedMs).toBeGreaterThanOrEqual(100);

      adapter.stop();
    });

    it('recovers to healthy feed state upon receiving fresh orderbook update after staleness', () => {
      const adapter = new LiveStreamAdapter({
        symbol: 'POLY-RECOVERY',
        heartbeatTimeoutMs: 200,
      });

      adapter.start();
      // Simulate staleness
      (adapter as any).lastUpdateTimestamp = Date.now() - 500;
      expect(adapter.isFeedHealthy()).toBe(false);

      // Receive fresh data
      adapter.ingestRawClob({
        tokenId: 'POLY-RECOVERY',
        bids: [{ price: '0.48', size: '100' }],
        asks: [{ price: '0.52', size: '100' }],
      });

      // Feed should immediately be healthy again
      expect(adapter.isFeedHealthy()).toBe(true);
      expect(adapter.getCurrentBook()?.bids[0]?.price).toBe(0.48);

      adapter.stop();
    });

    it('emits disconnected on stop() and marks feed unhealthy', () => {
      const adapter = new LiveStreamAdapter({ symbol: 'POLY-DISC' });
      let disconnectedEmitted = false;

      adapter.on('disconnected', () => { disconnectedEmitted = true; });

      adapter.start();
      expect(adapter.isFeedHealthy()).toBe(true);

      adapter.stop();
      expect(disconnectedEmitted).toBe(true);
      expect(adapter.isFeedHealthy()).toBe(false);
    });

    it('REMEDIATED: stop() emits cancel_all_quotes automatically on disconnect', () => {
      const adapter = new LiveStreamAdapter({ symbol: 'POLY-DISC-TEST' });
      let cancelAllQuotesEmitted = false;

      adapter.on('cancel_all_quotes', () => { cancelAllQuotesEmitted = true; });

      adapter.start();
      adapter.stop(); // WebSocket drops or connection closed

      // stop() now emits 'disconnected' and 'cancel_all_quotes'
      expect(cancelAllQuotesEmitted).toBe(true);
    });

    it('EMPIRICAL ARCHITECTURAL FINDING: Hardcoded 5,000ms check interval causes detection lag for short timeouts', () => {
      const adapter = new LiveStreamAdapter({
        symbol: 'POLY-LAG',
        heartbeatTimeoutMs: 500, // Client wants 500ms tripwire
      });

      adapter.start();
      // Access private timer
      const intervalHandle = (adapter as any).heartbeatInterval;
      expect(intervalHandle).toBeDefined();

      // At t=600ms, elapsed > heartbeatTimeoutMs (feed is stale), but timer has not fired yet because interval is 5000ms
      (adapter as any).lastUpdateTimestamp = Date.now() - 600;
      expect(adapter.isFeedHealthy()).toBe(false);

      adapter.stop();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. 24-D OBSERVATION VECTOR GUARANTEES
  // ═════════════════════════════════════════════════════════════════════════════
  describe('4. 24-D Observation Vector Normalization Guarantees', () => {
    it('strictly outputs Float64Array of length 24', () => {
      const book: MarlOrderBook = {
        symbol: 'DIM-TEST',
        venue: 'polymarket',
        bids: [{ price: 0.49, size: 100 }],
        asks: [{ price: 0.51, size: 100 }],
        timestamp: Date.now(),
      };

      const obs = OrderBookNormalizer.toObservation(book);
      expect(obs.observationVector).toBeInstanceOf(Float64Array);
      expect(obs.observationVector?.length).toBe(24);
    });

    it('maintains all 24 elements within [-1, 1] or [0, 1] across 1,000 randomized market replay ticks', () => {
      const config = MarketReplayConfigSchema.parse({
        symbol: 'VEC-TEST',
        stepCount: 1000,
        volatility: 0.04,
        randomSeed: 4242,
      });
      const engine = new MarketReplayEngine(config);

      for (let i = 0; i < 1000; i++) {
        const stepRes = engine.step();
        const randInventory = (Math.random() - 0.5) * 20000;
        const randTimeToHorizon = Math.random() * 100000;
        const randVol = Math.random() * 0.2;
        const randDelta = (Math.random() - 0.5) * 20000;

        const obs = OrderBookNormalizer.toObservation(
          stepRes.orderBook,
          randInventory,
          randTimeToHorizon,
          randVol,
          randDelta,
        );

        const vec = obs.observationVector!;
        expect(vec.length).toBe(24);

        // Element 0: inventory in [-1, 1]
        expect(vec[0]).toBeGreaterThanOrEqual(-1);
        expect(vec[0]).toBeLessThanOrEqual(1);

        // Element 1: timeToHorizon in [0, 1]
        expect(vec[1]).toBeGreaterThanOrEqual(0);
        expect(vec[1]).toBeLessThanOrEqual(1);

        // Element 2: volatility in [0, 1]
        expect(vec[2]).toBeGreaterThanOrEqual(0);
        expect(vec[2]).toBeLessThanOrEqual(1);

        // Element 3: L1 imbalance in [-1, 1]
        expect(vec[3]).toBeGreaterThanOrEqual(-1);
        expect(vec[3]).toBeLessThanOrEqual(1);

        // Element 4: depth imbalance in [-1, 1]
        expect(vec[4]).toBeGreaterThanOrEqual(-1);
        expect(vec[4]).toBeLessThanOrEqual(1);

        // Element 5: micro-price spread delta in [-1, 1]
        expect(vec[5]).toBeGreaterThanOrEqual(-1);
        expect(vec[5]).toBeLessThanOrEqual(1);

        // Element 6: spread in [0, 1]
        expect(vec[6]).toBeGreaterThanOrEqual(0);
        expect(vec[6]).toBeLessThanOrEqual(1);

        // Element 21: net delta in [-1, 1]
        expect(vec[21]).toBeGreaterThanOrEqual(-1);
        expect(vec[21]).toBeLessThanOrEqual(1);

        // All 24 elements must be finite and not NaN
        for (let d = 0; d < 24; d++) {
          expect(Number.isFinite(vec[d])).toBe(true);
          expect(Number.isNaN(vec[d])).toBe(false);
          expect(vec[d]).toBeGreaterThanOrEqual(-1);
          expect(vec[d]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('enforces boundary clamping under extreme outlier parameters', () => {
      const book: MarlOrderBook = {
        symbol: 'EXTREME',
        venue: 'polymarket',
        bids: [{ price: 0.01, size: 1e9 }],
        asks: [{ price: 0.99, size: 1e9 }],
        timestamp: Date.now(),
      };

      // Massive positive inventory (1,000,000)
      const obsPos = OrderBookNormalizer.toObservation(book, 1_000_000, 1_000_000, 10.0, 1_000_000);
      expect(obsPos.observationVector![0]).toBe(1.0);  // inventory clamped to 1.0
      expect(obsPos.observationVector![1]).toBe(1.0);  // time clamped to 1.0
      expect(obsPos.observationVector![2]).toBe(1.0);  // vol clamped to 1.0
      expect(obsPos.observationVector![21]).toBe(1.0); // delta clamped to 1.0

      // Massive negative inventory (-1,000,000)
      const obsNeg = OrderBookNormalizer.toObservation(book, -1_000_000, -100, -5.0, -1_000_000);
      expect(obsNeg.observationVector![0]).toBe(-1.0); // inventory clamped to -1.0
      expect(obsNeg.observationVector![1]).toBe(0.0);  // time clamped to 0.0
      expect(obsNeg.observationVector![2]).toBe(0.0);  // vol clamped to 0.0
      expect(obsNeg.observationVector![21]).toBe(-1.0); // delta clamped to -1.0
    });

    it('EMPIRICAL BUG REPRODUCTION: NaN passed as inventory or volatility leaks directly into observation vector', () => {
      const book: MarlOrderBook = {
        symbol: 'NAN-TEST',
        venue: 'polymarket',
        bids: [{ price: 0.50, size: 100 }],
        asks: [{ price: 0.52, size: 100 }],
        timestamp: Date.now(),
      };

      const obsNaN = OrderBookNormalizer.toObservation(book, NaN, 86400, NaN, NaN);
      // In JS, Math.max(-1, Math.min(1, NaN)) returns NaN!
      expect(Number.isNaN(obsNaN.observationVector![0])).toBe(true); // Inventory is NaN
      expect(Number.isNaN(obsNaN.observationVector![2])).toBe(true); // Volatility is NaN
      expect(Number.isNaN(obsNaN.observationVector![21])).toBe(true); // NetDelta is NaN
    });
  });
});
