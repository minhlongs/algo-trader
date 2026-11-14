/**
 * Regression suite for micro-execution & strategy edge cases:
 * - GTD expiration validation in `evaluatePolyRisk` and `validateClobV2Order`
 * - `NaN`/`Infinity` rejection in `validateClobV2Order`
 * - Best-touch-only opposite depth in `sweepOrderBookLevels` resting queue
 * - Long-NO markout polarity & both-leg fee lookup in `ToxicityAwareMarketMakerStrategy`
 * - Entry fee proration on 70% partial recycle in `recycleInBand`
 */

import { describe, expect, it, vi } from 'vitest';
import { validateClobV2Order } from '../../src/desk/polymarket/clob-v2-order-validation';
import type { ClobV2OrderIntent } from '../../src/desk/polymarket/clob-v2-venue-constants';
import { DEFAULT_PAPER_FEE_SCHEDULE, sweepOrderBookLevels } from '../../src/desk/polymarket/paper-fill-sweep';
import { evaluatePolyRisk, type PolyRiskState } from '../../src/desk/risk/poly-fail-closed-risk-engine';
import {
  ToxicityAwareMarketMakerStrategy,
  markoutBps,
} from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker';
import { recycleInBand } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-recycler';
import { NewsLatencyBook } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-state';
import { DEFAULT_CONFIG as NEWS_DEFAULT_CFG } from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-types';
import type { OpenPosition } from '../../src/desk/strategies/polymarket/base-polymarket-strategy';

const NOW = Date.now();

describe('validateClobV2Order & evaluatePolyRisk — NaN/Infinity and GTD expiration', () => {
  const baseIntent: ClobV2OrderIntent = {
    tokenId: 'tok-1',
    side: 'BUY',
    price: 0.5,
    size: 10,
    orderType: 'GTC',
    tickSize: 0.01,
  };

  it('rejects NaN/Infinity size, price, or tickSize in validateClobV2Order', () => {
    expect(validateClobV2Order({ ...baseIntent, size: Number.NaN }).ok).toBe(false);
    expect(validateClobV2Order({ ...baseIntent, price: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(validateClobV2Order({ ...baseIntent, tickSize: Number.NaN }).ok).toBe(false);
    expect(validateClobV2Order({ ...baseIntent, orderType: 'GTD', expiration: Number.NaN }).ok).toBe(false);
  });

  it('requires a future GTD expiration in evaluatePolyRisk', () => {
    const state: PolyRiskState = {
      nowMs: NOW,
      killSwitch: 'inactive',
      marketData: { observedAtMs: NOW - 200 },
      feeSchedule: { tokenId: 'tok-1', rate: 0.04, exponent: 1 },
      positionReconciliation: { reconciled: true, reconciledAtMs: NOW - 500, openPositionCount: 0 },
      riskBudget: { maxNotionalUsd: 200, currentDrawdownPct: 0 },
    };
    const missingExp = evaluatePolyRisk(
      { tokenId: 'tok-1', side: 'buy', price: 0.5, size: 10, orderType: 'GTD' },
      state,
    );
    expect(missingExp.allowed).toBe(false);

    const validFutureExp = evaluatePolyRisk(
      {
        tokenId: 'tok-1',
        side: 'buy',
        price: 0.5,
        size: 10,
        orderType: 'GTD',
        expiration: Math.floor(NOW / 1_000) + 300,
      },
      state,
    );
    expect(validFutureExp.allowed).toBe(true);
  });
});

describe('sweepOrderBookLevels — best-touch-only arrival rate', () => {
  it('uses only best opposite touch size rather than deep far-away wall liquidity', () => {
    const rng = () => 0;
    const outcome = sweepOrderBookLevels({
      book: {
        bids: [{ price: '0.45', size: '500' }],
        asks: [
          { price: '0.55', size: '1' },
          { price: '0.99', size: '1000000' },
        ],
      },
      side: 'BUY',
      requestedSize: 20,
      limitPrice: 0.45,
      schedule: DEFAULT_PAPER_FEE_SCHEDULE,
      rng,
    });
    expect(outcome.status).toBe('unmatched');
    expect(outcome.filledSize).toBe(0);
  });
});

describe('Long-NO markout polarity, Maker both-leg fees, and News recycle fee proration', () => {
  it('computes positive markoutBps for long NO when NO mid rises and negative when NO mid falls', () => {
    expect(markoutBps(0.45, 0.49, 'no')).toBeCloseTo(((0.49 - 0.45) / 0.45) * 10_000, 5);
    expect(markoutBps(0.45, 0.41, 'no')).toBeCloseTo(((0.41 - 0.45) / 0.45) * 10_000, 5);
  });

  it('resolves fee schedule for both YES and NO token IDs in ToxicityAwareMarketMakerStrategy', async () => {
    const resolve = vi.fn(async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.2 } as const));
    const books: Record<string, { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }>; timestamp: number }> = {
      'yes-a': { bids: [{ price: '0.47', size: '400' }], asks: [{ price: '0.52', size: '400' }], timestamp: NOW },
      'no-a': { bids: [{ price: '0.47', size: '400' }], asks: [{ price: '0.52', size: '400' }], timestamp: NOW },
    };
    const mm = new ToxicityAwareMarketMakerStrategy(
      {
        clob: {
          getOrderBook: async (id) => books[id] ?? { bids: [], asks: [], timestamp: NOW },
          getPrice: async () => 0.47,
          getMidPrice: async () => 0.495,
        },
        gamma: {
          getMarkets: async () => [],
          getMarket: async () => null,
          getMarketGroup: async () => null,
          searchMarkets: async () => [],
          getEvents: async () => [],
          getTrending: async () => [{
            id: 'c1', question: 'Macro hold?', conditionId: 'c1', slug: 'macro',
            outcomes: ['Yes', 'No'], outcomePrices: ['0.47', '0.47'],
            volume: 100_000, liquidity: 20_000,
            endDate: new Date(NOW + 10 * 86_400_000).toISOString(),
            active: true, closed: false, tokens: [], yesTokenId: 'yes-a', noTokenId: 'no-a', yesPrice: 0.47,
          }],
        },
        orderManager: {
          placeOrder: async () => ({ id: 'o1', status: 'filled', filled: true }),
          cancelOrder: async () => true,
          cancelAllOrders: async () => undefined,
          getOpenOrders: async () => [],
        },
        eventBus: { emit: () => {}, on: () => {}, off: () => {} },
        feeResolver: { resolve },
      },
      { minVolume: 1_000 },
    );
    await mm.execute();
    expect(resolve).toHaveBeenCalledWith('yes-a');
    expect(resolve).toHaveBeenCalledWith('no-a');
  });

  it('prorates entryFeesUsdc alongside sizeUsdc when recycling 70% of a news-latency leg', async () => {
    const book = new NewsLatencyBook();
    book.recordFill({
      eventId: 'ev-1',
      conditionId: 'cond-1',
      tokenId: 'yes-1',
      orderId: 'ord-1',
      price: 0.7,
      quantity: 100,
      endMs: NOW + 12 * 3_600_000,
      atMs: NOW,
    });
    const positions: OpenPosition[] = [{
      marketId: 'cond-1',
      tokenId: 'yes-1',
      side: 'yes',
      entryPrice: 0.7,
      sizeUsdc: 70,
      tokenQuantity: 100,
      entryFeesUsdc: 1.0,
      openedAt: NOW,
    }];

    await recycleInBand(
      {
        book,
        positions,
        executor: {
          recycle: async (_tokenId: string, shares: number) => ({
            orderId: 'sell-1',
            price: 0.94,
            quantity: shares,
            fees: '0',
          }),
        } as never,
        config: NEWS_DEFAULT_CFG,
        strategyName: 'primary-source-news-latency',
        getBid: async () => 0.95,
        emit: () => {},
      },
      NOW + 1_000,
    );

    expect(positions).toHaveLength(1);
    expect(positions[0]!.tokenQuantity).toBeCloseTo(30, 6);
    expect(positions[0]!.sizeUsdc).toBeCloseTo(21, 6);
    expect(positions[0]!.entryFeesUsdc).toBeCloseTo(0.3, 6);
  });
});
