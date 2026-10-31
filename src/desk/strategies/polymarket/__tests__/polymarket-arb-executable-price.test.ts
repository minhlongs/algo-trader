/**
 * The arb strategy must decide profitability on prices it can actually trade at.
 *
 * The previous implementation computed the YES+NO spread from mid prices and
 * then submitted both legs at the ask. Mid and ask differ, so a "profitable"
 * mid spread could still produce combined ask >= 1.00 — buying a certain loss.
 *
 * These tests pin the executable-price contract and the two-leg position
 * bookkeeping on one conditionId.
 */

import { describe, it, expect, vi } from 'vitest';
import { PolymarketArbStrategy } from '../../polymarket-arb-strategy';
import type { StrategyDeps } from '../../base-polymarket-strategy-types';
import type { GammaMarket } from '../../../polymarket/gamma-client';

function makeBook(bid: string, ask: string) {
  return {
    bids: [{ price: bid, size: '500' }],
    asks: [{ price: ask, size: '500' }],
    timestamp: Date.now(),
  };
}

function makeMarket(): GammaMarket {
  return {
    id: 'm1',
    question: 'Will it?',
    slug: 'will-it',
    conditionId: 'cond-1',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.5', '0.5'],
    volume: 50_000,
    volume24h: 5000,
    liquidity: 5000,
    endDate: '2027-12-31',
    active: true,
    closed: false,
    resolved: false,
    tokens: [],
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesPrice: 0.5,
  };
}

function makeDeps(yesBid: string, yesAsk: string, noBid: string, noAsk: string) {
  const orderManager = {
    placeOrder: vi.fn(async () => ({ id: 'order-1', filled: true })),
    cancelOrder: vi.fn(async () => {}),
    cancelAllOrders: vi.fn(async () => {}),
    getOpenOrders: vi.fn(async () => []),
  };

  const deps = {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) =>
        tokenId === 'yes-1'
          ? makeBook(yesBid, yesAsk)
          : makeBook(noBid, noAsk),
      ),
    },
    orderManager,
    eventBus: { emit: vi.fn() },
    gamma: { getTrending: vi.fn(async () => [makeMarket()]) },
  } as unknown as StrategyDeps;

  return { deps, orderManager };
}

describe('polymarket-arb executable-price contract', () => {
  it('declines when YES ask + NO ask >= 1 even though the mid spread looks profitable', async () => {
    // mids are 0.50 and 0.47, so mid sum = 0.97 and mid detection reports a 0.03 edge.
    // But the executable asks are 0.53 and 0.47, so combined ask = 1.00 — no edge at all.
    const { deps, orderManager } = makeDeps('0.48', '0.53', '0.45', '0.47');
    const strategy = new PolymarketArbStrategy(deps, { spreadLookback: 1, minSpread: 0.01 });

    await strategy.execute();

    expect(orderManager.placeOrder).not.toHaveBeenCalled();
  });

  it('enters when the executable ask pair is profitable after the configured cost floor', async () => {
    // asks are 0.50 and 0.47 → combined 0.97, and maxCombinedPrice 0.98 permits it.
    const { deps, orderManager } = makeDeps('0.48', '0.50', '0.45', '0.47');
    const strategy = new PolymarketArbStrategy(deps, { spreadLookback: 1, minSpread: 0.01 });

    await strategy.execute();

    expect(orderManager.placeOrder).toHaveBeenCalledTimes(2);
    const [yesCall, noCall] = orderManager.placeOrder.mock.calls.map((c) => c[0]);
    // Each leg is priced at its own executable ask.
    expect(yesCall.price).toBe('0.5000');
    expect(noCall.price).toBe('0.4700');
    // The YES and NO legs trade their own tokens, not the same token twice.
    expect(yesCall.tokenId).not.toBe(noCall.tokenId);
  });

  it('does not treat two legs on one conditionId as a single occupied market', async () => {
    // After a YES+NO pair on cond-1, the strategy still holds exactly two positions.
    const { deps, orderManager } = makeDeps('0.48', '0.50', '0.45', '0.47');
    const strategy = new PolymarketArbStrategy(deps, { spreadLookback: 1, minSpread: 0.01 });

    await strategy.execute();

    // Two distinct positions on the same conditionId (YES leg + NO leg),
    // not one collapsed entry.
    expect(orderManager.placeOrder).toHaveBeenCalledTimes(2);

    const yesCall = orderManager.placeOrder.mock.calls[0][0];
    const noCall = orderManager.placeOrder.mock.calls[1][0];
    expect(yesCall.tokenId).toBe('yes-1');
    expect(noCall.tokenId).toBe('no-1');
  });
});
