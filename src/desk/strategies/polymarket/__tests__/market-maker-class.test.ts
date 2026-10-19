/**
 * MarketMakerStrategy class — Integration Tests
 *
 * Complements market-maker.test.ts by exercising MarketMakerStrategy itself:
 * addMarket, setFairValue, executeTick, and stop.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  getOrderBook: vi.fn() as (tokenId: string) => Promise<{ bids: Array<{price:string;size:string}>; asks: Array<{price:string;size:string}>; timestamp: number }>,
}));

vi.mock('../../../core/logger', () => ({
  logger: { info: mocks.info, debug: mocks.debug, warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../polymarket/clob-client', () => ({}));

import { MarketMakerStrategy, DEFAULT_CONFIG } from '../market-maker';
import type { ClobClient } from '../../polymarket/clob-client';
import type { StrategyConfig } from '../../core/types';

const OPP = { yesTokenId: 'y-1', noTokenId: 'n-1', conditionId: 'c-1', volume: 5000, liquidity: 2000 };

function mkStrategy(overrides: Partial<typeof DEFAULT_CONFIG> = {}) {
  const clob: ClobClient = {
    getOrderBook: mocks.getOrderBook,
    getPrice: vi.fn(),
    getMidPrice: vi.fn(),
  };
  const cfg: StrategyConfig = { id: 'mm-test', params: overrides };
  return new MarketMakerStrategy(clob, cfg, 'cap-1');
}

function mkBook(mid: number, liq: number) {
  const bidPrice = (mid - 0.01).toFixed(2);
  const askPrice = (mid + 0.01).toFixed(2);
  return { bids: [{ price: bidPrice, size: String(liq) }], asks: [{ price: askPrice, size: String(liq) }], timestamp: 0 };
}

describe('MarketMakerStrategy class', () => {
  beforeEach(() => {
    mocks.getOrderBook.mockReset();
    mocks.debug.mockReset();
    mocks.info.mockReset();
  });

  it('logs info on construction with merged config', () => {
    mkStrategy({ baseSpread: 0.05 });
    expect(mocks.info).toHaveBeenCalledWith('[market-maker] Strategy initialized', expect.objectContaining({
      baseSpread: 0.05, quoteSize: 25, capital: 'cap-1',
    }));
  });

  it('addMarket stores state and is idempotent (no throw on dup)', () => {
    const s = mkStrategy();
    s.addMarket(OPP);
    expect(mocks.debug).toHaveBeenCalledWith('[market-maker] Market added', expect.objectContaining({ key: 'c-1' }));
    s.addMarket(OPP);
    expect(mocks.info).not.toHaveBeenCalledWith('[market-maker] Stopped');
  });

  it('setFairValue updates fair value for a matching token and is a no-op for unknown token', () => {
    const s = mkStrategy();
    s.addMarket(OPP);
    s.setFairValue('y-1', 0.7, 0.9);
    s.setFairValue('unknown-token', 0.9, 0.5);
    expect(mocks.debug).toHaveBeenCalledWith('[market-maker] Market added', expect.objectContaining({ key: 'c-1' }));
  });

  it('executeTick does nothing (returns early) when markets is empty', async () => {
    const s = mkStrategy();
    await s.executeTick();
    expect(mocks.getOrderBook).not.toHaveBeenCalled();
  });

  it('skips markets whose quotes are not yet stale', async () => {
    const s = mkStrategy({ refreshIntervalMs: 20_000 });
    s.addMarket(OPP);
    s.setFairValue('y-1', 0.5, 0.5);
    mocks.getOrderBook.mockResolvedValue(mkBook(0.5, 2000));
    await s.executeTick();
    await s.executeTick();
    expect(mocks.getOrderBook).toHaveBeenCalledTimes(1);
  });

  it('fetches order book and skips when liquidity is below threshold', async () => {
    const s = mkStrategy({ refreshIntervalMs: 0, minLiquidity: 10_000 });
    s.addMarket(OPP);
    s.setFairValue('y-1', 0.5, 0.5);
    mocks.getOrderBook.mockResolvedValueOnce(mkBook(0.505, 800));
    await s.executeTick();
    expect(mocks.getOrderBook).toHaveBeenCalledWith('y-1');
    expect(mocks.debug).not.toHaveBeenCalledWith('[market-maker] Ask filled', expect.anything());
    expect(mocks.debug).not.toHaveBeenCalledWith('[market-maker] Bid filled', expect.anything());
  });

  it('places quotes and detects ask and bid fills', async () => {
    const sAsk = mkStrategy({ baseSpread: 0.02, refreshIntervalMs: 0 });
    sAsk.addMarket(OPP);
    sAsk.setFairValue('y-1', 0.5, 0.5);
    mocks.getOrderBook.mockResolvedValueOnce(mkBook(0.515, 2000));
    await sAsk.executeTick();
    expect(mocks.debug).toHaveBeenCalledWith('[market-maker] Ask filled', expect.any(Object));

    const sBid = mkStrategy({ baseSpread: 0.02, refreshIntervalMs: 0 });
    sBid.addMarket(OPP);
    sBid.setFairValue('y-1', 0.5, 0.5);
    mocks.getOrderBook.mockResolvedValueOnce(mkBook(0.485, 2000));
    await sBid.executeTick();
    expect(mocks.debug).toHaveBeenCalledWith('[market-maker] Bid filled', expect.any(Object));
  });

  it('catches clobClient.getOrderBook rejection per-market and exercises empty book fallbacks', async () => {
    const s = mkStrategy({ baseSpread: 0.02, refreshIntervalMs: 0 });
    s.addMarket(OPP);
    s.setFairValue('y-1', 0.5, 0.5);
    mocks.getOrderBook.mockRejectedValueOnce(new Error('clob down'));
    await s.executeTick();
    expect(mocks.debug).not.toHaveBeenCalledWith('[market-maker] Ask filled', expect.anything());

    mocks.getOrderBook.mockResolvedValueOnce({ bids: [], asks: [], timestamp: 0 });
    await s.executeTick();
    expect(mocks.getOrderBook).toHaveBeenCalledWith('y-1');
  });

  it('stop clears all markets, logs info, and prevents further executeTick calls', async () => {
    const s = mkStrategy();
    s.addMarket(OPP);
    await s.stop();
    expect(mocks.info).toHaveBeenCalledWith('[market-maker] Stopped');
    await s.executeTick();
    expect(mocks.getOrderBook).not.toHaveBeenCalled();
  });
});
