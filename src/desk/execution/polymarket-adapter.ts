/**
 * Polymarket CLOB Execution Adapter
 * Bridges the algo-trader execution engine with Polymarket's REST CLOB API.
 * Docs: https://docs.polymarket.com/#clob-api
 *
 * Auth: POLY_API_KEY, POLY_API_SECRET, POLY_PASSPHRASE from process.env
 * Base: https://clob.polymarket.com
 */

import { PolymarketSigner, PolymarketOrder, SignedOrder } from './polymarket-signer';
import { requireLiveEnabled } from './execution-mode';
import { recordExternalApiLatency } from '../../platform/middleware/prometheus-metrics';
import { Http2ConnectionPool } from './http2-connection-pool';
import * as http2 from 'node:http2';
import { logger } from '../utils/logger';
import {
  CLOB_BASE,
  PolymarketOrderResponse,
  PolymarketOpenOrder,
  PolymarketOrderBook,
  PolymarketMarketInfo,
} from './polymarket-adapter-types';
import {
  serializeSignedOrder,
  computePolymarketSignature,
  buildPolymarketHeaders,
  executeHttp2StreamRequest,
} from './polymarket-adapter-transport';

// Re-export all types so existing callers importing from this file keep working.
export * from './polymarket-adapter-types';

/**
 * Execution adapter for Polymarket CLOB REST API.
 * Handles order placement, cancellation, and market queries.
 * Uses HTTP/2 connection pooling for reduced latency.
 */
export class PolymarketAdapter {
  private readonly apiUrl: string;
  private readonly signer: PolymarketSigner;
  private readonly apiKey: string;
  /** Used in HMAC-SHA256 signature — see _computeSignature */
  private readonly apiSecret: string;
  private readonly passphrase: string;
  private readonly http2Pool: Http2ConnectionPool;

  constructor(
    signer: PolymarketSigner,
    apiUrl: string = CLOB_BASE,
    http2Pool?: Http2ConnectionPool,
  ) {
    this.signer = signer;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = process.env.POLYMARKET_API_KEY || process.env.POLY_API_KEY || '';
    this.apiSecret = process.env.POLYMARKET_API_SECRET || process.env.POLY_API_SECRET || '';
    this.passphrase = process.env.POLYMARKET_PASSPHRASE || process.env.POLY_PASSPHRASE || '';
    this.http2Pool = http2Pool || Http2ConnectionPool.getInstance();

    // Warm connections on startup (async, don't await)
    this.warmPool().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to warm HTTP/2 pool', { error: msg });
    });
  }

  /** Pre-warm the connection pool for faster first requests */
  private async warmPool(): Promise<void> {
    try {
      await this.http2Pool.warmConnections(this.apiUrl, 3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Pool warming failed', { error: msg });
    }
  }

  /**
   * Place a signed order on the CLOB.
   * Hard env gate: LIVE mode requires LIVE_TRADING_ENABLED=true.
   */
  async placeOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    requireLiveEnabled('PolymarketAdapter.placeOrder');

    const signed: SignedOrder = await this.signer.signOrder(order);
    const body = this.serializeSignedOrder(signed);

    return this.request<PolymarketOrderResponse>('POST', '/order', body);
  }

  /** Cancel an open order by ID. */
  async cancelOrder(orderId: string): Promise<{ canceled: boolean }> {
    return this.request<{ canceled: boolean }>('DELETE', `/order/${orderId}`);
  }

  /** Fetch all open orders for the authenticated maker. */
  async getOpenOrders(): Promise<PolymarketOpenOrder[]> {
    return this.request<PolymarketOpenOrder[]>('GET', '/orders');
  }

  /** Fetch market metadata for a condition ID. */
  async getMarketInfo(conditionId: string): Promise<PolymarketMarketInfo> {
    return this.request<PolymarketMarketInfo>('GET', `/markets/${conditionId}`);
  }

  /** Fetch current orderbook snapshot for a token. */
  async getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    return this.request<PolymarketOrderBook>('GET', `/book?token_id=${tokenId}`);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  /** Make an HTTP/2 request using pooled sessions */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers = this.buildHeaders(method, path, body);
    const start = Date.now();
    let session: http2.ClientHttp2Session | null = null;

    try {
      session = await this.http2Pool.getSession(url);
      return await executeHttp2StreamRequest<T>(session, headers, method, path, body);
    } catch (err) {
      if (session && err instanceof Error && err.message.includes('session')) {
        logger.warn('HTTP/2 session error, will be recycled', { url, error: err.message });
      }
      throw err;
    } finally {
      if (session) {
        this.http2Pool.releaseSession(url, session);
      }

      const latencyMs = Date.now() - start;
      const region = process.env.REGION || 'unknown';
      recordExternalApiLatency('polymarket', path, region, latencyMs / 1000);
    }
  }

  /** Build auth headers required by Polymarket CLOB API */
  private buildHeaders(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Record<string, string> {
    return buildPolymarketHeaders(this.apiKey, this.apiSecret, this.passphrase, method, path, body);
  }

  private serializeSignedOrder(order: SignedOrder): Record<string, unknown> {
    return serializeSignedOrder(order);
  }

  private _computeSignature(
    timestamp: string,
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): string {
    return computePolymarketSignature(this.apiSecret, timestamp, method, path, body);
  }
}
