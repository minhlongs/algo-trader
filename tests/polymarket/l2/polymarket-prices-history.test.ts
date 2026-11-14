import { describe, it, expect } from 'vitest';
import {
  CLOB_BASE,
  createPolymarketDataApiClient,
} from '../../../src/desk/polymarket/polymarket-data-api-client';
import { TOKEN, fakeFetch } from './polymarket-data-api-fixtures';

describe('createPolymarketDataApiClient · fetchPricesHistory', () => {
  it('requests the CLOB prices-history endpoint by token id with interval and fidelity', async () => {
    const { fetchImpl, calls } = fakeFetch({ history: [{ t: 1_794_437_958, p: 0.36 }] });
    const client = createPolymarketDataApiClient({ fetchImpl });

    await client.fetchPricesHistory({ tokenId: TOKEN, interval: '1d', fidelity: 1 });

    const url = new URL(calls[0]);
    expect(`${url.origin}${url.pathname}`).toBe(`${CLOB_BASE}/prices-history`);
    expect(url.searchParams.get('market')).toBe(TOKEN);
    expect(url.searchParams.get('interval')).toBe('1d');
    expect(url.searchParams.get('fidelity')).toBe('1');
  });

  it('returns source-labelled points in epoch milliseconds, ascending by time', async () => {
    const { fetchImpl } = fakeFetch({
      history: [
        { t: 1_794_438_620, p: 0.335 },
        { t: 1_794_437_958, p: 0.36 },
      ],
    });
    const client = createPolymarketDataApiClient({ fetchImpl });

    const points = await client.fetchPricesHistory({ tokenId: TOKEN });

    expect(points).toEqual([
      { source: 'prices-history', t: 1_794_437_958_000, tokenId: TOKEN, price: 0.36 },
      { source: 'prices-history', t: 1_794_438_620_000, tokenId: TOKEN, price: 0.335 },
    ]);
  });

  it('defaults to interval 1d and fidelity 1', async () => {
    const { fetchImpl, calls } = fakeFetch({ history: [] });
    const client = createPolymarketDataApiClient({ fetchImpl });

    await client.fetchPricesHistory({ tokenId: TOKEN });

    const url = new URL(calls[0]);
    expect(url.searchParams.get('interval')).toBe('1d');
    expect(url.searchParams.get('fidelity')).toBe('1');
  });

  it('returns an empty array for a token with no history', async () => {
    const { fetchImpl } = fakeFetch({ history: [] });
    const client = createPolymarketDataApiClient({ fetchImpl });

    await expect(client.fetchPricesHistory({ tokenId: TOKEN })).resolves.toEqual([]);
  });

  it('throws a status + body carrying error on non-2xx', async () => {
    const { fetchImpl } = fakeFetch({ error: 'bad token' }, 400);
    const client = createPolymarketDataApiClient({ fetchImpl });

    await expect(client.fetchPricesHistory({ tokenId: TOKEN })).rejects.toMatchObject({
      name: 'PolymarketDataApiError',
      status: 400,
    });
    await expect(client.fetchPricesHistory({ tokenId: TOKEN })).rejects.toThrow(/bad token/);
  });

  it('throws on a payload missing the history array', async () => {
    const { fetchImpl } = fakeFetch({ points: [] });
    const client = createPolymarketDataApiClient({ fetchImpl });

    await expect(client.fetchPricesHistory({ tokenId: TOKEN })).rejects.toThrow(/prices-history/);
  });
});
