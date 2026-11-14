/**
 * End-to-end regression suite for Issue #265 live-pilot hardening follow-ups:
 * 1. Price-improving inside-spread resting maker fill (`queueAheadSize === 0`) in `paper-fill-sweep`
 * 2. `feeScheduleResolver` forwarding & live market observation refresh in `StrategyRunner` + `LiveTradingEventSubscriber`
 * 3. Strict `feesEnabled` & corrupt `feeSchedule` handling + `fee-calculator` non-finite schedule rejection
 * 4. Per-request L2 HMAC authentication headers on default live `createPolyCancelAllTransport`
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateLegFee } from '../../src/desk/arbitrage/profitability/fee-calculator';
import { tradingEventBus } from '../../src/desk/events/trading-event-bus';
import { computePolymarketSignature } from '../../src/desk/execution/polymarket-adapter-transport';
import { LiveExecutionGuard } from '../../src/desk/execution/live-execution-guard';
import { LivePositionTracker } from '../../src/desk/execution/live-position-tracker';
import { LiveTradingJournal } from '../../src/desk/execution/live-trading-journal';
import { PolymarketOrderReconciler } from '../../src/desk/execution/polymarket-order-reconciler';
import { cleanJournalFiles } from '../../src/desk/polymarket/__tests__/strategy-runner-fixtures';
import { createGammaFeeScheduleResolver } from '../../src/desk/polymarket/fee-schedule-resolver';
import type { GammaMarket } from '../../src/desk/polymarket/gamma-client';
import { LiveTradingOrchestrator } from '../../src/desk/polymarket/live-trading-orchestrator';
import { createOrchestratorPolyRiskRuntime } from '../../src/desk/polymarket/live-trading-poly-risk-gate';
import { sweepOrderBookLevels } from '../../src/desk/polymarket/paper-fill-sweep';
import type { PolymarketFeeSchedule } from '../../src/desk/polymarket/polymarket-fee-calculator';
import { createSeededRandom } from '../../src/desk/polymarket/queue-aware-fill-simulator';
import { StrategyRunner, createRunnerStrategyDeps } from '../../src/desk/polymarket/strategy-runner';
import { BasePolymarketStrategy } from '../../src/desk/strategies/polymarket/base-polymarket-strategy';
import { ToxicityAwareMarketMakerStrategy } from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker';

const SCHEDULE: PolymarketFeeSchedule = {
  exponent: 1,
  rate: 0.04,
  takerOnly: true,
  rebateRate: 0.25,
};

describe('Issue #265 — Live-Pilot Hardening Follow-ups', () => {
  beforeEach(() => {
    cleanJournalFiles();
  });

  afterEach(() => {
    cleanJournalFiles();
    vi.restoreAllMocks();
  });

  describe('1. Price-improving inside-spread resting maker fill (queueAheadSize === 0)', () => {
    it('fills a price-improving BUY inside a two-sided spread at front-of-queue and credits maker rebate', () => {
      const outcome = sweepOrderBookLevels({
        book: {
          bids: [{ price: '0.48', size: '500' }],
          asks: [{ price: '0.52', size: '600' }],
        },
        side: 'BUY',
        requestedSize: 15,
        limitPrice: 0.51, // bestBid (0.48) < 0.51 < bestAsk (0.52)
        schedule: SCHEDULE,
        orderType: 'GTC',
        rng: createSeededRandom(42),
      });

      expect(outcome.status).toBe('matched');
      expect(outcome.liquidityRole).toBe('maker');
      expect(outcome.avgFillPrice).toBe(0.51);
      expect(outcome.filledSize).toBeGreaterThan(0);
      expect(outcome.feeUsdc).toBeLessThan(0);
    });

    it('fills a price-improving SELL inside a two-sided spread at front-of-queue and credits maker rebate', () => {
      const outcome = sweepOrderBookLevels({
        book: {
          bids: [{ price: '0.48', size: '600' }],
          asks: [{ price: '0.52', size: '500' }],
        },
        side: 'SELL',
        requestedSize: 15,
        limitPrice: 0.49, // bestBid (0.48) < 0.49 < bestAsk (0.52)
        schedule: SCHEDULE,
        orderType: 'GTC',
        rng: createSeededRandom(42),
      });

      expect(outcome.status).toBe('matched');
      expect(outcome.liquidityRole).toBe('maker');
      expect(outcome.avgFillPrice).toBe(0.49);
      expect(outcome.filledSize).toBeGreaterThan(0);
      expect(outcome.feeUsdc).toBeLessThan(0);
    });

    it('rejects unquoted resting orders behind the book or on one-sided/empty books', () => {
      const behindBook = sweepOrderBookLevels({
        book: {
          bids: [{ price: '0.48', size: '500' }],
          asks: [{ price: '0.52', size: '500' }],
        },
        side: 'BUY',
        requestedSize: 15,
        limitPrice: 0.44, // behind bestBid with 0 resting liquidity at 0.44
        schedule: SCHEDULE,
        orderType: 'GTC',
        rng: createSeededRandom(42),
      });
      expect(behindBook.status).toBe('unmatched');
      expect(behindBook.rejectReason).toBe('no resting liquidity at the limit price');

      const oneSidedBook = sweepOrderBookLevels({
        book: {
          bids: [],
          asks: [{ price: '0.52', size: '500' }],
        },
        side: 'BUY',
        requestedSize: 15,
        limitPrice: 0.51,
        schedule: SCHEDULE,
        orderType: 'GTC',
        rng: createSeededRandom(42),
      });
      expect(oneSidedBook.status).toBe('unmatched');
      expect(oneSidedBook.rejectReason).toBe('no resting liquidity at the limit price');
    });
  });

  describe('2. StrategyRunner feeResolver forwarding & market observation refresh', () => {
    it('forwards feeScheduleResolver from tradingConfig and orchestrator into StrategyRunner deps', async () => {
      const resolve = vi.fn(async () => SCHEDULE);
      const now = Date.now();
      const market: GammaMarket = {
        id: 'm-mm-1',
        question: 'Will rate stay unchanged?',
        conditionId: 'cond-mm-1',
        slug: 'rate-unchanged',
        outcomes: ['Yes', 'No'],
        outcomePrices: ['0.47', '0.47'],
        volume: 150_000,
        liquidity: 30_000,
        endDate: new Date(now + 10 * 86_400_000).toISOString(),
        active: true,
        closed: false,
        tokens: [],
        yesTokenId: 'yes-mm-1',
        noTokenId: 'no-mm-1',
        yesPrice: 0.47,
      };

      const sharedOrch = new LiveTradingOrchestrator({
        paperTrading: true,
        capitalUsdc: 5_000,
      });
      sharedOrch.setFeeScheduleResolver({ resolve });
      expect(sharedOrch.getFeeScheduleResolver()).toEqual({ resolve });

      const runner = new StrategyRunner(
        ToxicityAwareMarketMakerStrategy as never,
        {
          strategyConfig: { minVolume: 1_000 } as never,
          tradingConfig: { paperTrading: true, capitalUsdc: 5_000 },
          minExecutionIntervalMs: 0,
          deps: {
            clob: {
              getOrderBook: async () => ({
                bids: [{ price: '0.47', size: '500' }],
                asks: [{ price: '0.52', size: '500' }],
                timestamp: now,
              }),
              getPrice: async () => 0.47,
              getMidPrice: async () => 0.495,
            },
            gamma: {
              getMarkets: async () => [market],
              getMarket: async () => market,
              getMarketGroup: async () => null,
              searchMarkets: async () => [market],
              getEvents: async () => [],
              getTrending: async () => [market],
            },
          },
        },
        sharedOrch,
      );

      await runner.start();
      tradingEventBus.emit('PRICE_UPDATE', {
        tokenId: 'yes-mm-1',
        bid: 0.47,
        ask: 0.52,
        timestamp: Date.now(),
      });
      await new Promise((r) => setTimeout(r, 40));

      expect(resolve).toHaveBeenCalledWith('yes-mm-1');
      expect(resolve).toHaveBeenCalledWith('no-mm-1');

      await runner.stop();
      await sharedOrch.stop();
    });

    it('refreshes recordMarketObservation via wrapped LIVE clob reads and valid PRICE_UPDATE events', async () => {
      // 1) Valid PRICE_UPDATE refreshes PolyRisk market observation, whereas tick-trigger does not
      const resolver = { resolve: vi.fn(async () => SCHEDULE) };
      const orch = new LiveTradingOrchestrator({
        paperTrading: true,
        capitalUsdc: 10_000,
        enforcePolyRiskGate: true,
        feeScheduleResolver: resolver,
      });
      await orch.start();

      // Synthetic tick-trigger must NOT satisfy market observation
      tradingEventBus.emit('PRICE_UPDATE', {
        tokenId: 'tick-trigger',
        bid: 0.48,
        ask: 0.52,
        timestamp: Date.now(),
      });
      await expect(
        orch.placeOrder({
          tokenId: 'tok-live-obs',
          side: 'BUY',
          price: 0.5,
          size: 10,
          expiration: Math.floor(Date.now() / 1000) + 300,
          nonce: '1',
          feeRateBps: 0,
          signatureType: 0,
        }),
      ).rejects.toThrow(/UNRESOLVED_STATE/);

      // Real two-sided PRICE_UPDATE refreshes market observation and unblocks PolyRisk
      tradingEventBus.emit('PRICE_UPDATE', {
        tokenId: 'tok-live-obs',
        bid: 0.49,
        ask: 0.51,
        timestamp: Date.now(),
      });
      const placed = await orch.placeOrder({
        tokenId: 'tok-live-obs',
        side: 'BUY',
        price: 0.5,
        size: 10,
        expiration: Math.floor(Date.now() / 1000) + 300,
        nonce: '2',
        feeRateBps: 0,
        signatureType: 0,
      });
      expect(placed.status).toBe('matched');
      await orch.stop();

      // 2) LIVE mode StrategyRunner wraps deps.clob getOrderBook/getPrice/getMidPrice to record observations
      let capturedClob: {
        getOrderBook(id: string): Promise<unknown>;
        getPrice(id: string): Promise<number>;
        getMidPrice(id: string): Promise<number>;
      } | null = null;

      class ProbeStrategy extends BasePolymarketStrategy {
        constructor(deps: ConstructorParameters<typeof BasePolymarketStrategy>[0], cfg: ConstructorParameters<typeof BasePolymarketStrategy>[1]) {
          super(deps, cfg, 'polymarket-arb');
          capturedClob = deps.clob;
        }
        protected async scanEntries(): Promise<void> {}
      }

      const recordMarketObservation = vi.fn();
      const fakeLiveOrchestrator = {
        getStatus: () => 'running' as const,
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        getMode: () => 'LIVE' as const,
        getFeeScheduleResolver: () => resolver,
        recordMarketObservation,
        getPositionSummary: () => ({
          positionCount: 0,
          totalExposureUsdc: 0,
          totalUnrealizedPnl: 0,
          totalRealizedPnl: 0,
          availableCapital: 1_000,
        }),
        getReconciliationSummary: () => ({} as never),
        executeStrategyTick: async (_k: string, fn: () => Promise<void>) => fn(),
      } as unknown as LiveTradingOrchestrator;

      const liveRunner = new StrategyRunner(
        ProbeStrategy as never,
        {
          strategyConfig: {
            minVolume: 1_000,
            takeProfitPct: 0.02,
            stopLossPct: 0.02,
            maxHoldMs: 60_000,
            maxPositions: 2,
            cooldownMs: 1_000,
            positionSize: '10',
          },
          tradingConfig: { paperTrading: false, capitalUsdc: 1_000, feeScheduleResolver: resolver },
          deps: {
            clob: {
              getOrderBook: async () => ({ bids: [{ price: '0.48', size: '50' }], asks: [{ price: '0.52', size: '50' }], timestamp: Date.now() }),
              getPrice: async () => 0.5,
              getMidPrice: async () => 0.5,
            },
          },
        },
        fakeLiveOrchestrator,
      );

      await liveRunner.start();
      expect(capturedClob).not.toBeNull();
      await capturedClob!.getOrderBook('tok-1');
      await capturedClob!.getPrice('tok-1');
      await capturedClob!.getMidPrice('tok-1');
      expect(recordMarketObservation).toHaveBeenCalledTimes(3);

      const helperDeps = createRunnerStrategyDeps({} as never, undefined, resolver);
      expect(helperDeps.feeResolver).toBe(resolver);
      await liveRunner.stop();
    });
  });

  describe('3. Strict feesEnabled & corrupt feeSchedule fail-closed + fee-calculator NaN guard', () => {
    it('prioritizes feesEnabled=false over stale schedule, fails closed on corrupt feeSchedule, and keeps bare market exempt', async () => {
      const staleExempt = createGammaFeeScheduleResolver({
        fetchImpl: (async () =>
          new Response(
            JSON.stringify([{ feesEnabled: false, feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.2 } }]),
            { status: 200 },
          )) as unknown as typeof fetch,
      });
      await expect(staleExempt.resolve('tok-exempt')).resolves.toBeNull();

      const corruptNoFlag = createGammaFeeScheduleResolver({
        fetchImpl: (async () =>
          new Response(JSON.stringify([{ feeSchedule: { rate: '' } }]), { status: 200 })) as unknown as typeof fetch,
      });
      await expect(corruptNoFlag.resolve('tok-corrupt')).rejects.toThrow(/unparsable feeSchedule/);

      const bareMarket = createGammaFeeScheduleResolver({
        fetchImpl: (async () =>
          new Response(JSON.stringify([{ question: 'anything' }]), { status: 200 })) as unknown as typeof fetch,
      });
      await expect(bareMarket.resolve('tok-bare')).resolves.toBeNull();
    });

    it('fails closed in calculateLegFee when PolymarketFeeSchedule fields are NaN or Infinity', () => {
      for (const badSchedule of [
        { exponent: 1, rate: Number.NaN, takerOnly: true, rebateRate: 0.2 },
        { exponent: Number.NaN, rate: 0.04, takerOnly: true, rebateRate: 0.2 },
        { exponent: 1, rate: 0.04, takerOnly: true, rebateRate: Number.POSITIVE_INFINITY },
      ]) {
        const res = calculateLegFee(
          {
            venue: 'polymarket',
            symbol: 'tok-bad-sched',
            side: 'buy',
            price: 0.5,
            size: 10,
            polymarketFeeSchedule: badSchedule,
          },
          5,
        );
        expect(res).toEqual({ available: false, venue: 'polymarket', symbol: 'tok-bad-sched' });
      }
    });
  });

  describe('4. Authenticated L2 HMAC headers on default live createPolyCancelAllTransport', () => {
    const savedEnv: Record<string, string | undefined> = {};
    const envKeys = [
      'POLYMARKET_API_KEY',
      'POLY_API_KEY',
      'POLYMARKET_API_SECRET',
      'POLY_API_SECRET',
      'POLYMARKET_PASSPHRASE',
      'POLY_PASSPHRASE',
    ];

    afterEach(() => {
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
    });

    it('signs DELETE /cancel-all with fresh L2 HMAC headers at fire() time when live credentials are in env', async () => {
      for (const key of envKeys) savedEnv[key] = process.env[key];
      process.env['POLYMARKET_API_KEY'] = 'test-live-key';
      process.env['POLYMARKET_API_SECRET'] = 'test-live-secret';
      process.env['POLYMARKET_PASSPHRASE'] = 'test-live-passphrase';

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response('{"canceled":["ord-1"]}', { status: 200 }));

      let nowSec = 1_700_000_100;
      vi.spyOn(Date, 'now').mockImplementation(() => nowSec * 1_000);

      const runtime = createOrchestratorPolyRiskRuntime({
        config: {
          paperTrading: false,
          capitalUsdc: 5_000,
          apiUrl: 'https://clob.polymarket.com',
        },
        getOrderManager: () => null,
        getPositionTracker: () => new LivePositionTracker(5_000),
        getReconciler: () => new PolymarketOrderReconciler(5_000),
        getJournal: () => new LiveTradingJournal(),
      });

      const firstFire = await runtime.killSwitch.fire('emergency halt 1');
      expect(firstFire.issued).toBe(true);
      expect(firstFire.result?.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url1, init1] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url1).toBe('https://clob.polymarket.com/cancel-all');
      expect(init1.method).toBe('DELETE');
      const headers1 = init1.headers as Record<string, string>;
      expect(headers1['POLY-API-KEY']).toBe('test-live-key');
      expect(headers1['POLY-PASSPHRASE']).toBe('test-live-passphrase');
      expect(headers1['POLY-TIMESTAMP']).toBe('1700000100');
      expect(headers1['POLY-SIGNATURE']).toBe(
        computePolymarketSignature('test-live-secret', '1700000100', 'DELETE', '/cancel-all'),
      );

      // Advance clock, reset latch, and fire again — signature and timestamp must refresh
      nowSec = 1_700_000_250;
      runtime.killSwitch.reset();
      await runtime.killSwitch.fire('emergency halt 2');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [, init2] = fetchSpy.mock.calls[1] as [string, RequestInit];
      const headers2 = init2.headers as Record<string, string>;
      expect(headers2['POLY-TIMESTAMP']).toBe('1700000250');
      expect(headers2['POLY-SIGNATURE']).toBe(
        computePolymarketSignature('test-live-secret', '1700000250', 'DELETE', '/cancel-all'),
      );

      // Guard sanity: latched kill switch rejects subsequent authorizeOrder calls
      const guard = new LiveExecutionGuard({ capitalUsdc: 5_000, enabled: true });
      await expect(
        runtime.authorizeOrder(
          {
            tokenId: 'tok-1',
            side: 'BUY',
            price: 0.5,
            size: 10,
            expiration: nowSec + 300,
            nonce: '1',
            feeRateBps: 0,
            signatureType: 0,
          },
          guard,
        ),
      ).rejects.toThrow(/KILL_SWITCH_ACTIVE/);
    });
  });
});
