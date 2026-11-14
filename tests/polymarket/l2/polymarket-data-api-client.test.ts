import { describe, it, expect, vi } from 'vitest';
import {
  DATA_API_BASE,
  PolymarketDataApiError,
  createPolymarketDataApiClient,
} from '../../../src/desk/polymarket/polymarket-data-api-client';
import { CONDITION, TOKEN, TRADE_ROW, WALLET, fakeFetch, jsonResponse } from './polymarket-data-api-fixtures';

describe('createPolymarketDataApiClient · fetchTrades', () => {
  it('requests data-api v2 by condition id (not the retired v1 route)', async () => {
    const { fetchImpl, calls } = fakeFetch({ data: [TRADE_ROW], pagination: { has_more: false, next_cursor: null } });
    const client = createPolymarketDataApiClient({ fetchImpl });

    await client.fetchTrades({ conditionId: CONDITION });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(`${url.origin}${url.pathname}`).toBe(`${DATA_API_BASE}/v2/trades`);
    expect(url.searchParams.get('condition')).toBe(CONDITION);
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.has('offset')).toBe(false);
  });

  it('maps rows to typed, source-labelled trades with epoch-millisecond timestamps', async () => {
    const { fetchImpl } = fakeFetch({ data: [TRADE_ROW], pagination: { has_more: false, next_cursor: null } });
    const client = createPolymarketDataApiClient({ fetchImpl });

    const { trades, nextCursor } = await client.fetchTrades({ conditionId: CONDITION });

    expect(nextCursor).toBeNull();
    expect(trades).toEqual([
      {
        source: 'data-api-v2',
        t: 1_794_487_905_000,
        conditionId: CONDITION,
        tokenId: TOKEN,
        side: 'BUY',
        price: 0.39,
        size: 46.85,
        outcome: 'Yes',
        title: TRADE_ROW.title,
        slug: TRADE_ROW.slug,
        wallet: WALLET,
        transactionHash: TRADE_ROW.transaction_hash,
      },
    ]);
  });

  it('supports wallet-only queries and cursor paging', async () => {
    const { fetchImpl, calls } = fakeFetch({ data: [], pagination: { has_more: true, next_cursor: 'abc' } });
    const client = createPolymarketDataApiClient({ fetchImpl });

    const result = await client.fetchTrades({ wallet: WALLET, limit: 25, cursor: 'prev' });

    const url = new URL(calls[0]);
    expect(url.searchParams.get('user')).toBe(WALLET);
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('cursor')).toBe('prev');
    expect(url.searchParams.has('condition')).toBe(false);
    expect(result.nextCursor).toBe('abc');
  });

  it('skips rows that fail the schema rather than failing the page', async () => {
    const { fetchImpl } = fakeFetch({ data: [TRADE_ROW, { side: 'BUY' }], pagination: {} });
    const client = createPolymarketDataApiClient({ fetchImpl });

    const { trades } = await client.fetchTrades({ conditionId: CONDITION });
    expect(trades).toHaveLength(1);
  });

  it('throws a status + body carrying error on non-2xx', async () => {
    const { fetchImpl } = fakeFetch({ error: 'Data API v1 has been retired' }, 410);
    const client = createPolymarketDataApiClient({ fetchImpl });

    await expect(client.fetchTrades({ conditionId: CONDITION })).rejects.toBeInstanceOf(PolymarketDataApiError);
    await expect(client.fetchTrades({ conditionId: CONDITION })).rejects.toMatchObject({ status: 410 });
    await expect(client.fetchTrades({ conditionId: CONDITION })).rejects.toThrow(/retired/);
  });

  it('throws on a payload that is not the documented envelope', async () => {
    const { fetchImpl } = fakeFetch([TRADE_ROW]);
    const client = createPolymarketDataApiClient({ fetchImpl });

    await expect(client.fetchTrades({ conditionId: CONDITION })).rejects.toThrow(/v2\/trades/);
  });
});

describe('createPolymarketDataApiClient · fetchPositions', () => {
  it('requests data-api v2 positions by wallet and maps the fields', async () => {
    const { fetchImpl, calls } = fakeFetch({
      data: [
        {
          condition_id: CONDITION,
          title: 'Next Gemini Flash Model released?',
          outcome: 'Yes',
          current_size: 408.25,
          avg_price: 0.2726,
          current_price: 0.21,
          unrealized_pnl: -25.5962,
        },
      ],
    });
    const client = createPolymarketDataApiClient({ fetchImpl });

    const positions = await client.fetchPositions(WALLET);

    const url = new URL(calls[0]);
    expect(`${url.origin}${url.pathname}`).toBe(`${DATA_API_BASE}/v2/positions`);
    expect(url.searchParams.get('user')).toBe(WALLET);
    expect(positions).toEqual([
      {
        conditionId: CONDITION,
        title: 'Next Gemini Flash Model released?',
        outcome: 'Yes',
        size: 408.25,
        avgPrice: 0.2726,
        currentPrice: 0.21,
        unrealizedPnl: -25.5962,
      },
    ]);
  });

  it('defaults to the global fetch when no implementation is injected', async () => {
    const originalFetch = globalThis.fetch;
    const spy = vi.fn(async () => jsonResponse({ history: [] }));
    globalThis.fetch = spy as unknown as typeof fetch;
    try {
      await createPolymarketDataApiClient().fetchPricesHistory({ tokenId: TOKEN });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
