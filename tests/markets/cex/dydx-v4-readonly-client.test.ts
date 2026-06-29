/**
 * DydxV4ReadonlyClient unit tests — resilientFetch mocked via vi.hoisted.
 * No real network calls. Tests mapping, error handling, env var gating.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (must be before any imports that use the mocked modules) ────
const { mockResilientFetch } = vi.hoisted(() => ({
  mockResilientFetch: vi.fn<typeof import('../../../src/shared/resilience/resilient-fetch.js').resilientFetch>(),
}));

vi.mock('../../../src/shared/resilience/resilient-fetch.js', () => ({
  resilientFetch: mockResilientFetch,
}));

vi.mock('../../../src/core/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DydxV4ReadonlyClient } from '../../../src/markets/cex/dydx-v4-readonly-client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errResp(status: number, msg = 'error'): Response {
  return new Response(msg, { status, statusText: msg });
}

const FAKE_INDEXER = 'https://test-indexer.dydx.trade';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DydxV4ReadonlyClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DYDX_ADDRESS;
  });

  function makeClient(address?: string): DydxV4ReadonlyClient {
    if (address) process.env.DYDX_ADDRESS = address;
    return new DydxV4ReadonlyClient(FAKE_INDEXER);
  }

  // ── getCandles ──────────────────────────────────────────────────────────────

  describe('getCandles', () => {
    it('fetches and maps candles correctly', async () => {
      mockResilientFetch.mockResolvedValueOnce(
        jsonResp({
          candles: [
            {
              startedAt: '2024-01-01T00:00:00.000Z',
              open: '42000.5',
              high: '43000.0',
              low: '41500.0',
              close: '42500.0',
              baseTokenVolume: '150.25',
            },
          ],
        }),
      );

      const client = makeClient();
      const candles = await client.getCandles('BTC-USD', '1h', 1);

      expect(candles).toHaveLength(1);
      expect(candles[0]).toMatchObject({
        timestamp: new Date('2024-01-01T00:00:00.000Z').getTime(),
        open: 42000.5,
        high: 43000.0,
        low: 41500.0,
        close: 42500.0,
        volume: 150.25,
      });

      const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/v4/candles/perpetualMarkets/BTC-USD');
      expect(calledUrl).toContain('resolution=1HOUR');
      expect(calledUrl).toContain('limit=1');
    });

    it('maps all supported timeframes to correct resolution', async () => {
      const cases: [string, string][] = [
        ['1m', '1MIN'],
        ['5m', '5MINS'],
        ['15m', '15MINS'],
        ['30m', '30MINS'],
        ['1h', '1HOUR'],
        ['4h', '4HOURS'],
        ['1d', '1DAY'],
      ];

      const client = makeClient();
      for (const [tf, resolution] of cases) {
        mockResilientFetch.mockResolvedValueOnce(jsonResp({ candles: [] }));
        await client.getCandles('ETH-USD', tf);
        const url = mockResilientFetch.mock.calls[mockResilientFetch.mock.calls.length - 1][0] as string;
        expect(url).toContain(`resolution=${resolution}`);
      }
    });

    it('throws for unsupported timeframe without calling fetch', async () => {
      const client = makeClient();
      await expect(client.getCandles('BTC-USD', '3h')).rejects.toThrow(
        'Unsupported timeframe "3h"',
      );
      expect(mockResilientFetch).not.toHaveBeenCalled();
    });

    it('returns empty array when indexer returns empty candles', async () => {
      mockResilientFetch.mockResolvedValueOnce(jsonResp({ candles: [] }));
      const client = makeClient();
      const candles = await client.getCandles('BTC-USD');
      expect(candles).toEqual([]);
    });

    it('throws on non-ok HTTP response', async () => {
      mockResilientFetch.mockResolvedValueOnce(errResp(500, 'Internal Server Error'));
      const client = makeClient();
      await expect(client.getCandles('BTC-USD')).rejects.toThrow(
        'dYdX Indexer candles error 500',
      );
    });
  });

  // ── getOrderBook ────────────────────────────────────────────────────────────

  describe('getOrderBook', () => {
    it('fetches and maps order book correctly', async () => {
      mockResilientFetch.mockResolvedValueOnce(
        jsonResp({
          bids: [
            { price: '42000.00', size: '1.5' },
            { price: '41990.00', size: '2.0' },
          ],
          asks: [
            { price: '42010.00', size: '0.8' },
            { price: '42020.00', size: '1.2' },
          ],
        }),
      );

      const client = makeClient();
      const book = await client.getOrderBook('BTC-USD');

      expect(book.symbol).toBe('BTC-USD');
      expect(book.bids).toHaveLength(2);
      expect(book.bids[0]).toEqual({ price: 42000.0, size: 1.5 });
      expect(book.asks[0]).toEqual({ price: 42010.0, size: 0.8 });
      expect(book.timestamp).toBeGreaterThan(0);

      const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/v4/orderbooks/perpetualMarket/BTC-USD');
    });

    it('handles empty bids and asks', async () => {
      mockResilientFetch.mockResolvedValueOnce(jsonResp({ bids: [], asks: [] }));
      const client = makeClient();
      const book = await client.getOrderBook('ETH-USD');
      expect(book.bids).toEqual([]);
      expect(book.asks).toEqual([]);
    });

    it('throws on non-ok HTTP response', async () => {
      mockResilientFetch.mockResolvedValueOnce(errResp(404, 'Market not found'));
      const client = makeClient();
      await expect(client.getOrderBook('FAKE-USD')).rejects.toThrow(
        'dYdX Indexer orderbook error 404',
      );
    });
  });

  // ── getBalances ─────────────────────────────────────────────────────────────

  describe('getBalances', () => {
    it('throws when DYDX_ADDRESS is not set', async () => {
      const client = makeClient(); // no address
      await expect(client.getBalances()).rejects.toThrow(
        'DYDX_ADDRESS env var is required',
      );
      expect(mockResilientFetch).not.toHaveBeenCalled();
    });

    it('maps subaccount equity and asset positions', async () => {
      mockResilientFetch.mockResolvedValueOnce(
        jsonResp({
          subaccount: {
            address: 'dydx1abc123',
            subaccountNumber: 0,
            equity: '5000.00',
            freeCollateral: '3000.00',
            assetPositions: [
              { symbol: 'BTC', side: 'LONG', size: '0.1', assetId: '1' },
            ],
          },
        }),
      );

      const client = makeClient('dydx1abc123');
      const balances = await client.getBalances();

      expect(balances).toHaveLength(2);
      const usdc = balances.find(b => b.asset === 'USDC')!;
      expect(usdc.total).toBe(5000.0);
      expect(usdc.free).toBe(3000.0);
      expect(usdc.locked).toBeCloseTo(2000.0);

      const btc = balances.find(b => b.asset === 'BTC')!;
      expect(btc.total).toBe(0.1);
      expect(btc.free).toBe(0.1);

      const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/v4/addresses/dydx1abc123/subaccountNumber/0');
    });

    it('skips zero-size asset positions', async () => {
      mockResilientFetch.mockResolvedValueOnce(
        jsonResp({
          subaccount: {
            address: 'dydx1abc123',
            subaccountNumber: 0,
            equity: '1000.00',
            freeCollateral: '1000.00',
            assetPositions: [
              { symbol: 'ETH', side: 'LONG', size: '0', assetId: '2' },
            ],
          },
        }),
      );

      const client = makeClient('dydx1abc123');
      const balances = await client.getBalances();
      expect(balances).toHaveLength(1);
      expect(balances[0].asset).toBe('USDC');
    });

    it('throws on non-ok HTTP response', async () => {
      mockResilientFetch.mockResolvedValueOnce(errResp(401, 'Unauthorized'));
      const client = makeClient('dydx1bad');
      await expect(client.getBalances()).rejects.toThrow(
        'dYdX Indexer subaccount error 401',
      );
    });
  });

  // ── getName ─────────────────────────────────────────────────────────────────

  it('getName returns dydx-v4-readonly', () => {
    expect(makeClient().getName()).toBe('dydx-v4-readonly');
  });
});
