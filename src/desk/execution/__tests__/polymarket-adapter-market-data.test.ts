/**
 * PolymarketAdapter — Market Info, Order Book, Error Handling, and URL Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetExecutionModeCache } from '../execution-mode';
import { PolymarketAdapter } from '../polymarket-adapter';
import { PolymarketSigner, type PolymarketOrder, type SignedOrder } from '../polymarket-signer';

function createMockStream(expectedPath: string) {
  const headers: Record<string, string> = { ':status': '200', 'content-type': 'application/json' };
  const entry = mockHttp2Responses.get(expectedPath);
  const status = entry?.status ?? 200;
  headers[':status'] = String(status);
  const stream: Record<string, unknown> = {
    on: (_ev: string, cb: (...args: unknown[]) => void) => {
      if (_ev === 'response') queueMicrotask(() => { cb(headers); queueMicrotask(() => {
        if (entry?.body && stream._dataHandler) (stream._dataHandler as (b: string) => void)(entry.body);
        if (stream._endHandler) (stream._endHandler as (h: Record<string, unknown>) => void)({ ':status': status });
      }); });
      if (_ev === 'data') stream._dataHandler = cb;
      if (_ev === 'end') stream._endHandler = cb;
      if (_ev === 'error') stream._errorHandler = cb;
      return stream;
    },
    write: vi.fn(), end: vi.fn(), destroy: vi.fn(), get headers() { return headers; },
  };
  return stream;
}

const { mockHttp2Responses, mockRequest } = vi.hoisted(() => {
  const responses = new Map<string, { status: number; body: string }>();
  return { mockHttp2Responses: responses, mockRequest: vi.fn((o: Record<string, unknown>) => createMockStream(String(o[':path'] || '/'))) };
});

const createMockSession = () => ({
  request: mockRequest, ping: vi.fn((cb: (e?: Error) => void) => cb()), on: vi.fn().mockReturnThis(),
  close: vi.fn((cb: () => void) => cb()), destroy: vi.fn(), get destroyed() { return false; },
});

vi.mock('node:http2', () => ({ connect: vi.fn(createMockSession), ClientHttp2Session: class {}, ClientHttp2Stream: class {}, HTTP2_HEADER_STATUS: ':status' }));
vi.mock('../http2-connection-pool', () => ({
  Http2ConnectionPool: class { static getInstance() { return new this(); } async getSession() { return createMockSession(); } releaseSession() {} async warmConnections() {} },
}));
vi.mock('../../platform/middleware/prometheus-metrics', () => ({ recordExternalApiLatency: vi.fn() }));
vi.mock('../utils/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

const { mockSignOrder, mockGetAddress, mockCreateOrderHash, mockGenerateNonce } = vi.hoisted(() => ({
  mockSignOrder: vi.fn<[PolymarketOrder], Promise<SignedOrder>>(), mockGetAddress: vi.fn<[], string>(),
  mockCreateOrderHash: vi.fn<[PolymarketOrder], string>(), mockGenerateNonce: vi.fn<[], string>(),
}));

vi.mock('../polymarket-signer', () => ({
  PolymarketSigner: vi.fn(function (this: Record<string, unknown>) {
    this.signOrder = mockSignOrder; this.createOrderHash = mockCreateOrderHash;
    this.generateNonce = mockGenerateNonce; this.getAddress = mockGetAddress;
  }),
}));

function setupEnv(): void {
  process.env.POLY_API_KEY = 'test-api-key'; process.env.POLY_API_SECRET = 'test-api-secret';
  process.env.POLY_PASSPHRASE = 'test-passphrase'; process.env.LIVE_TRADING_ENABLED = 'true';
  resetExecutionModeCache();
}

function makeOrder(overrides: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return { tokenId: '0xabc123', price: 0.55, size: 100, side: 'BUY', expiration: 9999999999, nonce: '987654321', feeRateBps: 100, signatureType: 2, ...overrides };
}

describe('PolymarketAdapter — Market Data, Errors, and URLs', () => {
  let adapter: PolymarketAdapter;
  beforeEach(() => {
    vi.clearAllMocks();
    setupEnv();
    mockHttp2Responses.clear();
    mockGetAddress.mockReturnValue('0x1234567890abcdef1234567890abcdef12345678');
    mockSignOrder.mockImplementation(async (order: PolymarketOrder) => ({
      ...order, signature: '0xsigned-data', maker: '0x1234567890abcdef1234567890abcdef12345678',
    } as SignedOrder));
    adapter = new PolymarketAdapter(new PolymarketSigner('dummy-key') as unknown as PolymarketSigner, 'https://clob.polymarket.com');
  });

  it('should GET /markets/:conditionId and return market metadata', async () => {
    const marketInfo = { condition_id: '0xcond123', question: 'Will BTC hit $100k?', tokens: [{ token_id: '0xyes', outcome: 'Yes' }] };
    mockHttp2Responses.set('/markets/0xcond123', { status: 200, body: JSON.stringify(marketInfo) });
    const result = await adapter.getMarketInfo('0xcond123');
    expect(result).toEqual(marketInfo);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect((mockRequest.mock.calls[0] as [Record<string, unknown>])[0][':path']).toBe('/markets/0xcond123');
  });

  it('should GET /book?token_id=... and return order book snapshot', async () => {
    const orderBook = { market: '0xcond123', asset_id: '0xyes', bids: [{ price: '0.55', size: '1000' }], asks: [{ price: '0.56', size: '800' }] };
    mockHttp2Responses.set('/book?token_id=0xyes', { status: 200, body: JSON.stringify(orderBook) });
    const result = await adapter.getOrderBook('0xyes');
    expect(result).toEqual(orderBook);
    expect((mockRequest.mock.calls[0] as [Record<string, unknown>])[0][':path']).toBe('/book?token_id=0xyes');
  });

  it('should throw an error with status code on non-ok response', async () => {
    mockHttp2Responses.set('/order', { status: 400, body: 'Invalid order parameters' });
    await expect(adapter.placeOrder(makeOrder())).rejects.toThrow('Polymarket CLOB error 400: Invalid order parameters');
  });

  it('should include server error details for 500 responses', async () => {
    mockHttp2Responses.set('/orders', { status: 500, body: 'Internal server error' });
    await expect(adapter.getOpenOrders()).rejects.toThrow('Polymarket CLOB error 500: Internal server error');
  });

  it('should propagate errors from the signer', async () => {
    mockSignOrder.mockRejectedValueOnce(new Error('Signing failed: invalid key'));
    await expect(adapter.placeOrder(makeOrder())).rejects.toThrow('Signing failed: invalid key');
  });

  it('should handle 404 when canceling a non-existent order', async () => {
    mockHttp2Responses.set('/order/nonexistent', { status: 404, body: 'Order not found' });
    await expect(adapter.cancelOrder('nonexistent')).rejects.toThrow('Polymarket CLOB error 404: Order not found');
  });

  it('should strip trailing slash from the configured API URL', async () => {
    const trailingAdapter = new PolymarketAdapter(new PolymarketSigner('k') as unknown as PolymarketSigner, 'https://clob.polymarket.com/');
    mockHttp2Responses.set('/order/order-001', { status: 200, body: JSON.stringify({ canceled: true }) });
    await trailingAdapter.cancelOrder('order-001');
    expect((mockRequest.mock.calls[0] as [Record<string, unknown>])[0][':path']).toBe('/order/order-001');
  });

  it('should default to https://clob.polymarket.com when no URL is provided', async () => {
    const defaultAdapter = new PolymarketAdapter(new PolymarketSigner('k') as unknown as PolymarketSigner);
    mockHttp2Responses.set('/order/order-001', { status: 200, body: JSON.stringify({ canceled: true }) });
    await defaultAdapter.cancelOrder('order-001');
    expect((mockRequest.mock.calls[0] as [Record<string, unknown>])[0][':path']).toBe('/order/order-001');
  });
});
