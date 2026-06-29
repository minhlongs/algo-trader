/**
 * PolymarketAdapter Tests
 * Covers order placement, cancellation, market queries, error handling, and auth headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketAdapter, PolymarketOrderResponse, PolymarketOpenOrder } from '../polymarket-adapter';
import { PolymarketSigner } from '../polymarket-signer';
import type { PolymarketOrder, SignedOrder } from '../polymarket-signer';

// ── Hoisted mocks (accessible inside vi.mock factory) ─────────────────────

const { mockSignOrder, mockGetAddress, mockCreateOrderHash, mockGenerateNonce } = vi.hoisted(() => ({
  mockSignOrder: vi.fn<[PolymarketOrder], Promise<SignedOrder>>(),
  mockGetAddress: vi.fn<[], string>(),
  mockCreateOrderHash: vi.fn<[PolymarketOrder], string>(),
  mockGenerateNonce: vi.fn<[], string>(),
}));

vi.mock('../polymarket-signer', () => ({
  // Use a regular function (not arrow) so `new` works as a constructor
  PolymarketSigner: vi.fn(function (this: Record<string, unknown>) {
    this.signOrder = mockSignOrder;
    this.createOrderHash = mockCreateOrderHash;
    this.generateNonce = mockGenerateNonce;
    this.getAddress = mockGetAddress;
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_API_URL = 'https://clob.polymarket.com';

function setupEnv(): void {
  process.env.POLY_API_KEY = 'test-api-key';
  process.env.POLY_API_SECRET = 'test-api-secret';
  process.env.POLY_PASSPHRASE = 'test-passphrase';
}

function clearEnv(): void {
  delete process.env.POLY_API_KEY;
  delete process.env.POLY_API_SECRET;
  delete process.env.POLY_PASSPHRASE;
}

function makeFetchStub<T>(data: T, status = 200): vi.Mock {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function makeErrorFetchStub(status: number, body: string): vi.Mock {
  const fn = vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function makeSignedOrder(overrides: Partial<SignedOrder> = {}): SignedOrder {
  return {
    tokenId: '0xabc123',
    price: 0.55,
    size: 100,
    side: 'BUY',
    expiration: 9999999999,
    nonce: '987654321',
    feeRateBps: 100,
    signatureType: 2 as const,
    signature: '0xsigned-data',
    maker: '0x1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return {
    tokenId: '0xabc123',
    price: 0.55,
    size: 100,
    side: 'BUY',
    expiration: 9999999999,
    nonce: '987654321',
    feeRateBps: 100,
    signatureType: 2,
    ...overrides,
  };
}

/** Create a fresh adapter with the mocked signer */
function createAdapter(apiUrl?: string): PolymarketAdapter {
  const signer = new PolymarketSigner('dummy-key') as unknown as PolymarketSigner;
  return new PolymarketAdapter(signer, apiUrl);
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('PolymarketAdapter', () => {
  let adapter: PolymarketAdapter;
  let fetchMock: vi.Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    setupEnv();
    mockGetAddress.mockReturnValue('0x1234567890abcdef1234567890abcdef12345678');
    mockSignOrder.mockImplementation(async (order: PolymarketOrder) => makeSignedOrder({ ...order }));
    mockCreateOrderHash.mockReturnValue('0xorder-hash');
    mockGenerateNonce.mockReturnValue('987654321');

    adapter = createAdapter(TEST_API_URL);

    // Default: successful response
    fetchMock = makeFetchStub({
      orderID: 'order-001',
      status: 'matched',
    });
  });

  // ── Happy path: placeOrder ──────────────────────────────────────────

  describe('placeOrder', () => {
    it('should sign the order and return the CLOB response', async () => {
      const order = makeOrder();

      const result = await adapter.placeOrder(order);

      expect(mockSignOrder).toHaveBeenCalledWith(order);
      expect(result).toEqual<PolymarketOrderResponse>({
        orderID: 'order-001',
        status: 'matched',
      });
    });

    it('should POST to /order with the serialized signed order', async () => {
      const signed = makeSignedOrder();
      mockSignOrder.mockResolvedValueOnce(signed);

      await adapter.placeOrder(makeOrder());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${TEST_API_URL}/order`);
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.tokenID).toBe(signed.tokenId);
      expect(body.side).toBe(signed.side);
      expect(body.signature).toBe(signed.signature);
      expect(body.maker).toBe(signed.maker);
      expect(body.nonce).toBe(signed.nonce);
    });
  });

  // ── Happy path: cancelOrder ─────────────────────────────────────────

  describe('cancelOrder', () => {
    it('should DELETE /order/:id and return canceled status', async () => {
      makeFetchStub({ canceled: true });

      const result = await adapter.cancelOrder('order-001');

      expect(result).toEqual({ canceled: true });
      const fetchFn = fetch as unknown as vi.Mock;
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${TEST_API_URL}/order/order-001`);
      expect(init.method).toBe('DELETE');
    });
  });

  // ── Happy path: getOpenOrders ───────────────────────────────────────

  describe('getOpenOrders', () => {
    it('should GET /orders and return open orders array', async () => {
      const mockOrders: PolymarketOpenOrder[] = [
        {
          id: 'order-1',
          asset_id: '0xtoken1',
          price: '0.55',
          original_size: '100',
          size_matched: '0',
          side: 'BUY',
          expiration: '9999999999',
          status: 'LIVE',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'order-2',
          asset_id: '0xtoken2',
          price: '0.42',
          original_size: '200',
          size_matched: '50',
          side: 'SELL',
          expiration: '9999999999',
          status: 'LIVE',
          created_at: '2026-01-02T00:00:00Z',
        },
      ];
      makeFetchStub(mockOrders);

      const result = await adapter.getOpenOrders();

      expect(result).toEqual(mockOrders);
      expect(result).toHaveLength(2);
      const fetchFn = fetch as unknown as vi.Mock;
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${TEST_API_URL}/orders`);
      expect(init.method).toBe('GET');
    });
  });

  // ── Happy path: getMarketInfo ───────────────────────────────────────

  describe('getMarketInfo', () => {
    it('should GET /markets/:conditionId and return market metadata', async () => {
      const marketInfo = {
        condition_id: '0xcond123',
        question_id: '0xq456',
        question: 'Will BTC hit $100k in 2026?',
        description: 'A market on BTC price',
        market_slug: 'btc-100k-2026',
        end_date_iso: '2026-12-31T23:59:59Z',
        tokens: [
          { token_id: '0xyes', outcome: 'Yes', price: 0.55 },
          { token_id: '0xno', outcome: 'No', price: 0.45 },
        ],
        active: true,
        closed: false,
        archived: false,
        minimum_order_size: '5',
        minimum_tick_size: '0.01',
        category: 'crypto',
      };
      makeFetchStub(marketInfo);

      const result = await adapter.getMarketInfo('0xcond123');

      expect(result).toEqual(marketInfo);
      expect(result.condition_id).toBe('0xcond123');
      expect(result.tokens).toHaveLength(2);
      const fetchFn = fetch as unknown as vi.Mock;
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${TEST_API_URL}/markets/0xcond123`);
      expect(init.method).toBe('GET');
    });
  });

  // ── Happy path: getOrderBook ────────────────────────────────────────

  describe('getOrderBook', () => {
    it('should GET /book?token_id=... and return order book snapshot', async () => {
      const orderBook = {
        market: '0xcond123',
        asset_id: '0xyes',
        bids: [
          { price: '0.55', size: '1000' },
          { price: '0.54', size: '500' },
        ],
        asks: [
          { price: '0.56', size: '800' },
          { price: '0.57', size: '300' },
        ],
        hash: '0xbookhash',
        timestamp: '2026-06-29T12:00:00Z',
      };
      makeFetchStub(orderBook);

      const result = await adapter.getOrderBook('0xyes');

      expect(result).toEqual(orderBook);
      expect(result.bids).toHaveLength(2);
      expect(result.asks).toHaveLength(2);
      const fetchFn = fetch as unknown as vi.Mock;
      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${TEST_API_URL}/book?token_id=0xyes`);
      expect(init.method).toBe('GET');
    });
  });

  // ── Error handling ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw an error with status code on non-ok response', async () => {
      makeErrorFetchStub(400, 'Invalid order parameters');

      await expect(adapter.placeOrder(makeOrder())).rejects.toThrow(
        'Polymarket CLOB error 400: Invalid order parameters',
      );
    });

    it('should include server error details for 500 responses', async () => {
      makeErrorFetchStub(500, 'Internal server error');

      await expect(adapter.getOpenOrders()).rejects.toThrow(
        'Polymarket CLOB error 500: Internal server error',
      );
    });

    it('should propagate errors from the signer', async () => {
      mockSignOrder.mockRejectedValueOnce(new Error('Signing failed: invalid key'));

      await expect(adapter.placeOrder(makeOrder())).rejects.toThrow('Signing failed: invalid key');
    });

    it('should handle 404 when canceling a non-existent order', async () => {
      makeErrorFetchStub(404, 'Order not found');

      await expect(adapter.cancelOrder('nonexistent')).rejects.toThrow(
        'Polymarket CLOB error 404: Order not found',
      );
    });
  });

  // ── Auth headers ────────────────────────────────────────────────────

  describe('auth headers', () => {
    it('should include POLY-API-KEY, POLY-PASSPHRASE, and POLY-SIGNATURE in headers', async () => {
      await adapter.placeOrder(makeOrder());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;

      expect(headers['POLY-API-KEY']).toBe('test-api-key');
      expect(headers['POLY-PASSPHRASE']).toBe('test-passphrase');
      expect(headers['POLY-SIGNATURE']).toBeTruthy();
      expect(headers['POLY-SIGNATURE']).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should include POLY-TIMESTAMP and Content-Type headers', async () => {
      await adapter.placeOrder(makeOrder());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['POLY-TIMESTAMP']).toBeTruthy();
      expect(Number(headers['POLY-TIMESTAMP'])).toBeGreaterThan(0);
    });

    it('should omit auth headers when POLY_API_KEY is not set', async () => {
      clearEnv();
      const noAuthAdapter = createAdapter(TEST_API_URL);

      const localFetch = makeFetchStub({ orderID: 'x', status: 'matched' });

      await noAuthAdapter.placeOrder(makeOrder());

      const [, init] = localFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;

      expect(headers['POLY-API-KEY']).toBeUndefined();
      expect(headers['POLY-SIGNATURE']).toBeUndefined();
      // Timestamp and Content-Type should still be present
      expect(headers['POLY-TIMESTAMP']).toBeTruthy();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should produce different signatures for different payloads', async () => {
      await adapter.placeOrder(makeOrder({ price: 0.55 }));

      const [, init1] = fetchMock.mock.calls[0] as [string, RequestInit];
      const sig1 = (init1.headers as Record<string, string>)['POLY-SIGNATURE'];

      // Second call with different body → different signature
      const adapter2 = createAdapter(TEST_API_URL);
      const localFetch2 = makeFetchStub({ orderID: 'order-002', status: 'matched' });

      await adapter2.placeOrder(makeOrder({ price: 0.99 }));

      const [, init2] = localFetch2.mock.calls[0] as [string, RequestInit];
      const sig2 = (init2.headers as Record<string, string>)['POLY-SIGNATURE'];

      expect(sig1).not.toBe(sig2);
    });
  });

  // ── URL construction ────────────────────────────────────────────────

  describe('API URL handling', () => {
    it('should strip trailing slash from the configured API URL', async () => {
      const trailingAdapter = createAdapter('https://clob.polymarket.com/');

      const localFetch = makeFetchStub({ canceled: true });
      await trailingAdapter.cancelOrder('order-001');

      const [url] = localFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://clob.polymarket.com/order/order-001');
    });

    it('should default to https://clob.polymarket.com when no URL is provided', async () => {
      const defaultAdapter = createAdapter();

      const localFetch = makeFetchStub({ canceled: true });
      await defaultAdapter.cancelOrder('order-001');

      const [url] = localFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://clob.polymarket.com/order/order-001');
    });
  });
});
