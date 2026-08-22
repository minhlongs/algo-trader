/**
 * PolymarketAdapter HTTP/2 Integration Tests
 * Tests adapter initialization and delegation to HTTP/2 connection pool.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetExecutionModeCache } from '../../src/desk/execution/execution-mode';
import { PolymarketAdapter } from '../../src/desk/execution/polymarket-adapter';
import { PolymarketSigner } from '../../src/desk/execution/polymarket-signer';
import { Http2ConnectionPool } from '../../src/desk/execution/http2-connection-pool';

// No need to mock prometheus metrics; they are initialized lazily

describe('PolymarketAdapter with HTTP/2', () => {
  let adapter: PolymarketAdapter;
  let mockSigner: PolymarketSigner;

  beforeEach(() => {
    // placeOrder exercises the live order-placement path directly, so it
    // opts into LIVE mode explicitly. Production code never sets this — it is
    // an operator env var gated by a literal-string comparison.
    process.env.LIVE_TRADING_ENABLED = 'true';
    resetExecutionModeCache();
    vi.clearAllMocks();
    mockSigner = {
      signOrder: vi.fn().mockResolvedValue({
        tokenId: '0x123',
        size: 1.0,
        price: 0.5,
        expiration: 1234567890,
        nonce: '0x456',
        feeRateBps: 100,
        side: 'BUY',
        signatureType: 1,
        signature: '0xabc',
        maker: '0xmaker',
      }),
    } as unknown as PolymarketSigner;
  });

  describe('Constructor', () => {
    it('should initialize with singleton pool if not provided', () => {
      adapter = new PolymarketAdapter(mockSigner);
      expect(adapter).toBeInstanceOf(PolymarketAdapter);
      expect(Http2ConnectionPool.getInstance()).toBeInstanceOf(Http2ConnectionPool);
    });

    it('should use provided pool', () => {
      const customPool = new Http2ConnectionPool();
      adapter = new PolymarketAdapter(mockSigner, 'https://test.com', customPool);
      expect(adapter).toBeInstanceOf(PolymarketAdapter);
    });

    it('should warm pool on construction', async () => {
      const warmSpy = vi.spyOn(Http2ConnectionPool.getInstance(), 'warmConnections');
      adapter = new PolymarketAdapter(mockSigner);
      // Wait for async warmPool
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(warmSpy).toHaveBeenCalledWith('https://clob.polymarket.com', 3);
    });
  });

  describe('Public API Methods call request', () => {
    beforeEach(() => {
      adapter = new PolymarketAdapter(mockSigner);
    });

    it('placeOrder should call request with POST and body', async () => {
      const mockResponse = { orderID: 'test-order', status: 'matched' };
      const requestSpy = vi.spyOn(adapter as any, 'request').mockResolvedValue(mockResponse);

      await adapter.placeOrder({
        tokenId: '0x123',
        size: 1.0,
        price: 0.5,
        expiration: 1234567890,
      });

      expect(requestSpy).toHaveBeenCalledWith('POST', '/order', expect.any(Object));
    });

    it('cancelOrder should call request with DELETE', async () => {
      const mockResponse = { canceled: true };
      const requestSpy = vi.spyOn(adapter as any, 'request').mockResolvedValue(mockResponse);

      await adapter.cancelOrder('order-123');

      expect(requestSpy).toHaveBeenCalledWith('DELETE', '/order/order-123');
    });

    it('getOpenOrders should call request with GET', async () => {
      const mockResponse = [{ id: 'order1' }];
      const requestSpy = vi.spyOn(adapter as any, 'request').mockResolvedValue(mockResponse);

      await adapter.getOpenOrders();

      expect(requestSpy).toHaveBeenCalledWith('GET', '/orders');
    });

    it('getMarketInfo should call request with path', async () => {
      const mockResponse = { condition_id: '0x123', question: 'Test?' };
      const requestSpy = vi.spyOn(adapter as any, 'request').mockResolvedValue(mockResponse);

      await adapter.getMarketInfo('0x123');

      expect(requestSpy).toHaveBeenCalledWith('GET', '/markets/0x123');
    });

    it('getOrderBook should call request with query param', async () => {
      const mockResponse = { bids: [], asks: [] };
      const requestSpy = vi.spyOn(adapter as any, 'request').mockResolvedValue(mockResponse);

      await adapter.getOrderBook('0xtoken');

      expect(requestSpy).toHaveBeenCalledWith('GET', '/book?token_id=0xtoken');
    });
  });

  describe('Pool Delegation', () => {
    it('should delegate getSession to pool', async () => {
      adapter = new PolymarketAdapter(mockSigner);
      const getSessionSpy = vi.spyOn(Http2ConnectionPool.getInstance(), 'getSession');
      getSessionSpy.mockResolvedValue({
        request: vi.fn(),
        on: vi.fn(),
        ping: vi.fn(),
        close: vi.fn(),
      } as any);

      try {
        await adapter.getMarketInfo('0x123');
      } catch {
        // Expected to fail due to incomplete mock, but getSession should be called
      }

      expect(getSessionSpy).toHaveBeenCalled();
    });

    it('should delegate releaseSession to pool', async () => {
      adapter = new PolymarketAdapter(mockSigner);
      const releaseSpy = vi.spyOn(Http2ConnectionPool.getInstance(), 'releaseSession');

      try {
        await adapter.getMarketInfo('0x123');
      } catch {
        // ignore
      }

      expect(releaseSpy).toHaveBeenCalled();
    });
  });

  describe('Backward Compatibility', () => {
    it('should work without providing pool explicitly', () => {
      adapter = new PolymarketAdapter(mockSigner);
      expect(adapter).toBeInstanceOf(PolymarketAdapter);
    });
  });
});
