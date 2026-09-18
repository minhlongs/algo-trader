/**
 * PolymarketAdapter — Authentication Headers and Signature Tests
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

function clearEnv(): void {
  delete process.env.POLY_API_KEY; delete process.env.POLY_API_SECRET; delete process.env.POLY_PASSPHRASE;
}

function makeSignedOrder(overrides: Partial<SignedOrder> = {}): SignedOrder {
  return {
    tokenId: '0xabc123', price: 0.55, size: 100, side: 'BUY', expiration: 9999999999, nonce: '987654321',
    feeRateBps: 100, signatureType: 2 as const, signature: '0xsigned-data', maker: '0x1234567890abcdef1234567890abcdef12345678', ...overrides,
  };
}

function makeOrder(overrides: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return { tokenId: '0xabc123', price: 0.55, size: 100, side: 'BUY', expiration: 9999999999, nonce: '987654321', feeRateBps: 100, signatureType: 2, ...overrides };
}

describe('PolymarketAdapter — Authentication', () => {
  let adapter: PolymarketAdapter;
  beforeEach(() => {
    vi.clearAllMocks();
    setupEnv();
    mockHttp2Responses.clear();
    mockGetAddress.mockReturnValue('0x1234567890abcdef1234567890abcdef12345678');
    mockSignOrder.mockImplementation(async (order: PolymarketOrder) => makeSignedOrder({ ...order }));
    mockCreateOrderHash.mockReturnValue('0xorder-hash');
    mockGenerateNonce.mockReturnValue('987654321');
    adapter = new PolymarketAdapter(new PolymarketSigner('dummy-key') as unknown as PolymarketSigner, 'https://clob.polymarket.com');
    mockHttp2Responses.set('/order', { status: 200, body: JSON.stringify({ orderID: 'order-001', status: 'matched' }) });
  });

  it('should include POLY-API-KEY, POLY-PASSPHRASE, and POLY-SIGNATURE', async () => {
    await adapter.placeOrder(makeOrder());
    const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
    const headers = options as Record<string, string>;
    expect(headers['poly-api-key']).toBe('test-api-key');
    expect(headers['poly-passphrase']).toBe('test-passphrase');
    expect(headers['poly-signature']).toBeTruthy();
    expect(headers['poly-signature']).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('should include POLY-TIMESTAMP and Content-Type headers', async () => {
    await adapter.placeOrder(makeOrder());
    const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
    const headers = options as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['poly-timestamp']).toBeTruthy();
    expect(Number(headers['poly-timestamp'])).toBeGreaterThan(0);
  });

  it('should omit auth headers when POLY_API_KEY is not set', async () => {
    clearEnv();
    const noAuthAdapter = new PolymarketAdapter(new PolymarketSigner('dummy-key') as unknown as PolymarketSigner, 'https://clob.polymarket.com');
    mockHttp2Responses.set('/order', { status: 200, body: JSON.stringify({ orderID: 'x', status: 'matched' }) });
    await noAuthAdapter.placeOrder(makeOrder());
    const [options] = mockRequest.mock.calls[0] as [Record<string, unknown>];
    const headers = options as Record<string, string>;
    expect(headers['poly-api-key']).toBeUndefined();
    expect(headers['poly-signature']).toBeUndefined();
    expect(headers['poly-timestamp']).toBeTruthy();
    expect(headers['content-type']).toBe('application/json');
  });

  it('should produce different signatures for different payloads', async () => {
    await adapter.placeOrder(makeOrder({ price: 0.55 }));
    const [options1] = mockRequest.mock.calls[0] as [Record<string, unknown>];
    const sig1 = (options1 as Record<string, string>)['poly-signature'];

    const adapter2 = new PolymarketAdapter(new PolymarketSigner('dummy-key') as unknown as PolymarketSigner, 'https://clob.polymarket.com');
    mockHttp2Responses.set('/order', { status: 200, body: JSON.stringify({ orderID: 'order-002', status: 'matched' }) });
    await adapter2.placeOrder(makeOrder({ price: 0.99 }));
    const [options2] = mockRequest.mock.calls[1] as [Record<string, unknown>];
    const sig2 = (options2 as Record<string, string>)['poly-signature'];

    expect(sig1).not.toBe(sig2);
  });
});
