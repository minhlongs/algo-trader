import { describe, it, expect, vi } from 'vitest';
import {
  fetchRealPositions,
  fetchRealTrades,
  printRealLedger,
  type RealLedger,
} from '../../../src/desk/polymarket/real-trade-ledger';
import { PolymarketDataApiError } from '../../../src/desk/polymarket/polymarket-data-api-client';

const WALLET = '0x1234567890abcdef';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const TRADE_ROW = {
  proxy_wallet: WALLET,
  side: 'BUY',
  token_id: '123',
  condition_id: '0xcond',
  size: 10,
  price: 0.5,
  timestamp: 1_794_487_905,
  title: 'A real market',
  slug: 'a-real-market',
  outcome: 'Yes',
  transaction_hash: '0xhash',
};

const POSITION_ROW = {
  condition_id: '0xcond',
  title: 'A real market',
  outcome: 'Yes',
  current_size: 10,
  avg_price: 0.5,
  current_price: 0.6,
  unrealized_pnl: 1,
};

describe('real-trade-ledger (Data API v2)', () => {
  it('never calls the retired v1 routes', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return jsonResponse({ data: [TRADE_ROW], pagination: { has_more: false, next_cursor: null } });
    }) as unknown as typeof fetch;

    await fetchRealTrades(WALLET, 50, { fetchImpl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/v2/trades');
    expect(url.searchParams.get('user')).toBe(WALLET);
    expect(url.searchParams.get('limit')).toBe('50');
  });

  it('aggregates real trades into the unchanged RealLedger shape', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        data: [TRADE_ROW, { ...TRADE_ROW, side: 'SELL', price: 0.6, size: 5, transaction_hash: '0x2' }],
        pagination: { has_more: false, next_cursor: null },
      })) as unknown as typeof fetch;

    const ledger = await fetchRealTrades(WALLET, 100, { fetchImpl });

    expect(ledger.wallet).toBe(WALLET);
    expect(ledger.totalTrades).toBe(2);
    expect(ledger.totalBuys).toBe(1);
    expect(ledger.totalSells).toBe(1);
    expect(ledger.totalVolume).toBeCloseTo(10 * 0.5 + 5 * 0.6, 6);
    expect(ledger.trades[0]).toEqual({
      side: 'BUY',
      price: 0.5,
      size: 10,
      outcome: 'Yes',
      title: 'A real market',
      slug: 'a-real-market',
      timestamp: 1_794_487_905,
      transactionHash: '0xhash',
      wallet: WALLET,
    });
    expect(Number.isFinite(ledger.fetchedAt)).toBe(true);
  });

  it('propagates transport errors from the trade fetch (unlike the old silent v1 path)', async () => {
    const fetchImpl = (async () => jsonResponse({ error: 'boom' }, 500)) as unknown as typeof fetch;

    await expect(fetchRealTrades(WALLET, 50, { fetchImpl })).rejects.toBeInstanceOf(PolymarketDataApiError);
  });

  it('returns [] for positions when the fetch fails', async () => {
    const fetchImpl = (async () => jsonResponse({ error: 'boom' }, 500)) as unknown as typeof fetch;
    await expect(fetchRealPositions(WALLET, { fetchImpl })).resolves.toEqual([]);
  });

  it('maps v2 positions onto the exported RealPosition shape', async () => {
    const fetchImpl = (async () => jsonResponse({ data: [POSITION_ROW] })) as unknown as typeof fetch;

    await expect(fetchRealPositions(WALLET, { fetchImpl })).resolves.toEqual([
      {
        conditionId: '0xcond',
        title: 'A real market',
        outcome: 'Yes',
        size: 10,
        avgPrice: 0.5,
        currentPrice: 0.6,
        unrealizedPnl: 1,
      },
    ]);
  });

  it('printRealLedger keeps logging without console.log', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const ledger: RealLedger = {
      wallet: WALLET,
      trades: [
        {
          side: 'BUY',
          price: 0.5,
          size: 10,
          outcome: 'Yes',
          title: 'A real market',
          slug: 'a-real-market',
          timestamp: 1_794_487_905,
          transactionHash: '0xhash',
          wallet: WALLET,
        },
      ],
      totalTrades: 1,
      totalBuys: 1,
      totalSells: 0,
      totalVolume: 5,
      fetchedAt: Date.now(),
    };

    expect(() => printRealLedger(ledger)).not.toThrow();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});
