/**
 * PolymarketAdapter Tests
 * Covers order placement, cancellation, market queries, error handling, and auth headers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetExecutionModeCache } from '../execution-mode';
import { PolymarketAdapter, PolymarketOrderResponse, PolymarketOpenOrder } from '../polymarket-adapter';
import { PolymarketSigner } from '../polymarket-signer';
import type { PolymarketOrder, SignedOrder } from '../polymarket-signer';

// ── HTTP/2 mock state ────────────────────────────────────────────────────────

function createMockStream(expectedPath: string): any {
  const responseHeaders: Record<string, string> = {};
  const entry = mockHttp2Responses.get(expectedPath);
  const responseStatus = entry?.status ?? 200;

  responseHeaders[':status'] = String(responseStatus);
  responseHeaders['content-type'] = 'application/json';

  const stream: any = {
    on: (_event: string, callback: (...args: any[]) => void) => {
      // Simulate response -> data -> end sequence using queueMicrotask
      if (_event === 'response') {
        queueMicrotask(() => {
          callback(responseHeaders);
          queueMicrotask(() => {
            if (entry?.body && stream._dataHandler) {
              stream._dataHandler(entry.body);
            }
            if (stream._endHandler) {
              stream._endHandler({ ':status': responseStatus });
            }
          });
        });
      }
      if (_event === 'data') stream._dataHandler = callback;
      if (_event === 'end') stream._endHandler = callback;
      if (_event === 'error') stream._errorHandler = callback;
      return stream;
    },
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    get headers() { return responseHeaders; },
  };
  return stream;
}
const { mockHttp2Responses, mockRequest } = vi.hoisted(() => {
  const responses = new Map<string, { status: number; body: string }>();
  const request = vi.fn((options: any) => {
    const reqPath = options[':path'] || '/';
    return createMockStream(reqPath);
  });
  return { mockHttp2Responses: responses, mockRequest: request };
});

// ── HTTP/2 mock (adapter uses node:http2, not fetch) ───────────────────────



function createMockSession() {
  const session: any = {
    request: mockRequest,
    ping: vi.fn((cb: (err?: Error) => void) => cb()),
    on: vi.fn(() => session),
    close: vi.fn((cb: () => void) => cb()),
    destroy: vi.fn(),
    get destroyed() { return false; },
  };
  return session;
}

// @ts-expect-error mocking node:http2
vi.mock('node:http2', () => ({
  connect: vi.fn(createMockSession),
  ClientHttp2Session: class MockClientHttp2Session {},
  ClientHttp2Stream: class MockClientHttp2Stream {},
  HTTP2_HEADER_STATUS: ':status',
}));

vi.mock('../http2-connection-pool', () => ({
  Http2ConnectionPool: class MockPool {
    static getInstance() { return new MockPool(); }
    async getSession() { return createMockSession(); }
    releaseSession() {}
    async warmConnections() {}
  },
}));

vi.mock('../../platform/middleware/prometheus-metrics', () => ({
  recordExternalApiLatency: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Hoisted mocks (accessible inside vi.mock factory) ─────────────────────

const { mockSignOrder, mockGetAddress, mockCreateOrderHash, mockGenerateNonce } = vi.hoisted(() => ({
  mockSignOrder: vi.fn<[PolymarketOrder], Promise<SignedOrder>>(),
  mockGetAddress: vi.fn<[], string>(),
  mockCreateOrderHash: vi.fn<[PolymarketOrder], string>(),
  mockGenerateNonce: vi.fn<[], string>(),
}));

vi.mock('../polymarket-signer', () => ({
  PolymarketSigner: vi.fn(function (this: Record<string, unknown>) {
    this.signOrder = mockSignOrder;
    this.createOrderHash = mockCreateOrderHash;
    this.generateNonce = mockGenerateNonce;
    this.getAddress = mockGetAddress;
  }),
}));

/** Helper: set the HTTP/2 response for a given URL path */
function stubHttp2Response(path: string, data: any, status = 200): void {
  mockHttp2Responses.set(path, { status, body: JSON.stringify(data) });
}

function stubHttp2Error(path: string, status: number, body: string): void {
  mockHttp2Responses.set(path, { status, body });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_API_URL = 'https://clob.polymarket.com';

function setupEnv(): void {
  process.env.POLY_API_KEY = 'test-api-key';
  process.env.POLY_API_SECRET = 'test-api-secret';
  process.env.POLY_PASSPHRASE = 'test-passphrase';
  // These tests exercise the adapter's live order-placement path directly, so
  // they opt into LIVE mode explicitly. Production code never sets this — it is
  // an operator env var gated by a literal-string comparison.
  process.env.LIVE_TRADING_ENABLED = 'true';
  resetExecutionModeCache();
}

function clearEnv(): void {
  delete process.env.POLY_API_KEY;
  delete process.env.POLY_API_SECRET;
  delete process.env.POLY_PASSPHRASE;
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

  beforeEach(() => {
    vi.clearAllMocks();
    setupEnv();
    mockHttp2Responses.clear();
    mockGetAddress.mockReturnValue('0x1234567890abcdef1234567890abcdef12345678');
    mockSignOrder.mockImplementation(async (order: PolymarketOrder) => makeSignedOrder({ ...order }));
    mockCreateOrderHash.mockReturnValue('0xorder-hash');
    mockGenerateNonce.mockReturnValue('987654321');

    adapter = createAdapter(TEST_API_URL);

    // Default: successful response for POST /order
    stubHttp2Response('/order', { orderID: 'order-001', status: 'matched' });
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

    it('should make an HTTP/2 request to /order with the signed order body', async () => {
      const signed = makeSignedOrder();
      mockSignOrder.mockResolvedValueOnce(signed);

      await adapter.placeOrder(makeOrder());

      expect(mockRequest).toHaveBeenCalledTimes(1);
      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      expect(options[':method']).toBe('POST');
      expect(options[':path']).toBe('/order');

      const headers = options.headers as Record<string, string>;
      expect(headers['content-type']).toBe('application/json');
      expect(headers['poly-api-key']).toBe('test-api-key');
      expect(headers['poly-passphrase']).toBe('test-passphrase');
      expect(headers['poly-signature']).toBeTruthy();
      expect(headers['poly-timestamp']).toBeTruthy();
    });
  });

  // ── Happy path: cancelOrder ─────────────────────────────────────────

  describe('cancelOrder', () => {
    it('should DELETE /order/:id and return canceled status', async () => {
      stubHttp2Response('/order/order-001', { canceled: true });

      const result = await adapter.cancelOrder('order-001');

      expect(result).toEqual({ canceled: true });
      expect(mockRequest).toHaveBeenCalledTimes(1);
      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      expect(options[':method']).toBe('DELETE');
      expect(options[':path']).toBe('/order/order-001');
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
      stubHttp2Response('/orders', mockOrders);

      const result = await adapter.getOpenOrders();

      expect(result).toEqual(mockOrders);
      expect(result).toHaveLength(2);
      expect(mockRequest).toHaveBeenCalledTimes(1);
      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      expect(options[':method']).toBe('GET');
      expect(options[':path']).toBe('/orders');
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
      stubHttp2Response('/markets/0xcond123', marketInfo);

      const result = await adapter.getMarketInfo('0xcond123');

      expect(result).toEqual(marketInfo);
      expect(result.condition_id).toBe('0xcond123');
      expect(result.tokens).toHaveLength(2);
      expect(mockRequest).toHaveBeenCalledTimes(1);
      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      expect(options[':method']).toBe('GET');
      expect(options[':path']).toBe('/markets/0xcond123');
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
      stubHttp2Response('/book?token_id=0xyes', orderBook);

      const result = await adapter.getOrderBook('0xyes');

      expect(result).toEqual(orderBook);
      expect(result.bids).toHaveLength(2);
      expect(result.asks).toHaveLength(2);
      expect(mockRequest).toHaveBeenCalledTimes(1);
      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      expect(options[':method']).toBe('GET');
      expect(options[':path']).toBe('/book?token_id=0xyes');
    });
  });

  // ── Error handling ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw an error with status code on non-ok response', async () => {
      stubHttp2Error('/order', 400, 'Invalid order parameters');

      await expect(adapter.placeOrder(makeOrder())).rejects.toThrow(
        'Polymarket CLOB error 400: Invalid order parameters',
      );
    });

    it('should include server error details for 500 responses', async () => {
      stubHttp2Error('/orders', 500, 'Internal server error');

      await expect(adapter.getOpenOrders()).rejects.toThrow(
        'Polymarket CLOB error 500: Internal server error',
      );
    });

    it('should propagate errors from the signer', async () => {
      mockSignOrder.mockRejectedValueOnce(new Error('Signing failed: invalid key'));

      await expect(adapter.placeOrder(makeOrder())).rejects.toThrow('Signing failed: invalid key');
    });

    it('should handle 404 when canceling a non-existent order', async () => {
      stubHttp2Error('/order/nonexistent', 404, 'Order not found');

      await expect(adapter.cancelOrder('nonexistent')).rejects.toThrow(
        'Polymarket CLOB error 404: Order not found',
      );
    });
  });

  // ── Auth headers ────────────────────────────────────────────────────

  describe('auth headers', () => {
    it('should include POLY-API-KEY, POLY-PASSPHRASE, and POLY-SIGNATURE', async () => {
      await adapter.placeOrder(makeOrder());

      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      const headers = options.headers as Record<string, string>;

      expect(headers['poly-api-key']).toBe('test-api-key');
      expect(headers['poly-passphrase']).toBe('test-passphrase');
      expect(headers['poly-signature']).toBeTruthy();
      expect(headers['poly-signature']).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should include POLY-TIMESTAMP and Content-Type headers', async () => {
      await adapter.placeOrder(makeOrder());

      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      const headers = options.headers as Record<string, string>;

      expect(headers['content-type']).toBe('application/json');
      expect(headers['poly-timestamp']).toBeTruthy();
      expect(Number(headers['poly-timestamp'])).toBeGreaterThan(0);
    });

    it('should omit auth headers when POLY_API_KEY is not set', async () => {
      clearEnv();
      const noAuthAdapter = createAdapter(TEST_API_URL);
      stubHttp2Response('/order', { orderID: 'x', status: 'matched' });

      await noAuthAdapter.placeOrder(makeOrder());

      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      const headers = options.headers as Record<string, string>;

      expect(headers['poly-api-key']).toBeUndefined();
      expect(headers['poly-signature']).toBeUndefined();
      expect(headers['poly-timestamp']).toBeTruthy();
      expect(headers['content-type']).toBe('application/json');
    });

    it('should produce different signatures for different payloads', async () => {
      await adapter.placeOrder(makeOrder({ price: 0.55 }));
      const [options1] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      const sig1 = (options1.headers as Record<string, string>)['poly-signature'];

      const adapter2 = createAdapter(TEST_API_URL);
      stubHttp2Response('/order', { orderID: 'order-002', status: 'matched' });
      await adapter2.placeOrder(makeOrder({ price: 0.99 }));
      const [options2] = mockRequest.mock.calls[1] as [Record<string, unknown>];
      const sig2 = (options2.headers as Record<string, string>)['poly-signature'];

      expect(sig1).not.toBe(sig2);
    });
  });

  // ── URL construction ────────────────────────────────────────────────

  describe('API URL handling', () => {
    it('should strip trailing slash from the configured API URL', async () => {
      const trailingAdapter = createAdapter('https://clob.polymarket.com/');
      stubHttp2Response('/order/order-001', { canceled: true });

      await trailingAdapter.cancelOrder('order-001');

      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      expect(options[':path']).toBe('/order/order-001');
    });

    it('should default to https://clob.polymarket.com when no URL is provided', async () => {
      const defaultAdapter = createAdapter();
      stubHttp2Response('/order/order-001', { canceled: true });

      await defaultAdapter.cancelOrder('order-001');

      const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
      expect(options[':path']).toBe('/order/order-001');
    });
  });
});