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
import { createHmac } from 'crypto';
import { recordExternalApiLatency } from '../../platform/middleware/prometheus-metrics';
import { Http2ConnectionPool } from './http2-connection-pool';
import * as http2 from 'node:http2';
import { logger } from '../utils/logger';

const CLOB_BASE = 'https://clob.polymarket.com';

// ── Response shapes from CLOB API ────────────────────────────────────────────

export interface PolymarketOrderResponse {
  orderID: string;
  status: 'matched' | 'delayed' | 'unmatched' | 'canceled';
  error?: string;
}

export interface PolymarketOpenOrder {
  id: string;
  asset_id: string;
  price: string;
  original_size: string;
  size_matched: string;
  side: 'BUY' | 'SELL';
  expiration: string;
  status: string;
  created_at: string;
}

export interface PolymarketBookLevel {
  price: string;
  size: string;
}

export interface PolymarketOrderBook {
  market: string;
  asset_id: string;
  bids: PolymarketBookLevel[];
  asks: PolymarketBookLevel[];
  hash: string;
  timestamp: string;
}

export interface PolymarketMarketInfo {
  condition_id: string;
  question_id: string;
  question: string;
  description: string;
  market_slug: string;
  end_date_iso: string;
  game_start_time?: string;
  resolution_source?: string;
  tokens: Array<{ token_id: string; outcome: string; price: number }>;
  active: boolean;
  closed: boolean;
  archived: boolean;
  minimum_order_size: string;
  minimum_tick_size: string;
  category: string;
  fpmm?: string;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

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

  /**
   * @param apiUrl - CLOB base URL (default: https://clob.polymarket.com)
   * @param signer - Configured PolymarketSigner instance
   * @param http2Pool - Optional HTTP/2 connection pool (creates singleton if not provided)
   */
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
      if (err instanceof Error) {
        logger.warn('Failed to warm HTTP/2 pool', { error: err.message });
      } else {
        logger.warn('Failed to warm HTTP/2 pool', { error: String(err) });
      }
    });
  }

  /**
   * Pre-warm the connection pool for faster first requests
   */
  private async warmPool(): Promise<void> {
    try {
      await this.http2Pool.warmConnections(this.apiUrl, 3);
    } catch (err) {
      if (err instanceof Error) {
        logger.warn('Pool warming failed', { error: err.message });
      } else {
        logger.warn('Pool warming failed', { error: String(err) });
      }
    }
  }

  /**
   * Place a signed order on the CLOB.
   * @param order - Unsigned order params
   * @returns Order ID and status from CLOB
   */
  async placeOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    // Hard env gate: LIVE mode requires the operator to set
    // LIVE_TRADING_ENABLED=true explicitly. This is the last line of defense
    // before an order reaches the exchange — no caller can bypass it.
    requireLiveEnabled('PolymarketAdapter.placeOrder');

    const signed: SignedOrder = await this.signer.signOrder(order);
    const body = this.serializeSignedOrder(signed);

    return this.request<PolymarketOrderResponse>('POST', '/order', body);
  }

  /**
   * Cancel an open order by ID.
   * @param orderId - CLOB order ID to cancel
   */
  async cancelOrder(orderId: string): Promise<{ canceled: boolean }> {
    return this.request<{ canceled: boolean }>('DELETE', `/order/${orderId}`);
  }

  /**
   * Fetch all open orders for the authenticated maker.
   */
  async getOpenOrders(): Promise<PolymarketOpenOrder[]> {
    return this.request<PolymarketOpenOrder[]>('GET', '/orders');
  }

  /**
   * Fetch market metadata for a condition ID.
   * @param conditionId - Market condition ID (0x-prefixed hex)
   */
  async getMarketInfo(conditionId: string): Promise<PolymarketMarketInfo> {
    return this.request<PolymarketMarketInfo>('GET', `/markets/${conditionId}`);
  }

  /**
   * Fetch current orderbook snapshot for a token.
   * @param tokenId - YES or NO outcome token ID
   */
  async getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    return this.request<PolymarketOrderBook>('GET', `/book?token_id=${tokenId}`);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Make an HTTP/2 request using pooled sessions
   */
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
      // Acquire session from pool
      session = await this.http2Pool.getSession(url);

      // Build HTTP/2 request headers
      const reqHeaders: http2.OutgoingHttpHeaders = {
        ':method': method,
        ':path': path,
        // Convert headers to lowercase (HTTP/2 requirement)
        ...Object.fromEntries(
          Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
        ),
      };

      return await new Promise<T>((resolve, reject) => {
        const reqStream = session!.request(reqHeaders);

        let responseData = '';

        // Response headers received
        reqStream.on('response', (headers) => {
          const status = headers[':status'] as number;

          if (status < 200 || status >= 300) {
            // Error status - read body and reject
            reqStream.on('data', (chunk) => {
              responseData += chunk.toString();
            });
            reqStream.on('end', () => {
              reject(new Error(`Polymarket CLOB error ${status}: ${responseData || headers[':status']}`));
            });
            return;
          }

          // Success - collect response body
          reqStream.on('data', (chunk) => {
            responseData += chunk;
          });

          reqStream.on('end', () => {
            try {
              const parsed = JSON.parse(responseData) as T;
              resolve(parsed);
            } catch (parseErr) {
              reject(new Error(`Failed to parse response: ${parseErr}`));
            }
          });
        });

        // Stream error
        reqStream.on('error', (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          reject(new Error(`HTTP/2 stream error: ${msg}`));
        });

        // Write body if present
        if (body) {
          reqStream.write(JSON.stringify(body));
        }

        reqStream.end();
      });
    } catch (err) {
      // On error, mark session as problematic and release
      if (session && err instanceof Error && err.message.includes('session')) {
        // Session-level error will be cleaned up by pool
        logger.warn('HTTP/2 session error, will be recycled', { url, error: err.message });
      }
      throw err;
    } finally {
      // Always release session back to pool
      if (session) {
        this.http2Pool.releaseSession(url, session);
      }

      // Record latency metrics
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
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'POLY-TIMESTAMP': timestamp,
    };

    if (this.apiKey) {
      headers['POLY-API-KEY'] = this.apiKey;
      headers['POLY-PASSPHRASE'] = this.passphrase;
      // and set headers['POLY-SIGNATURE'] = signature
      headers['POLY-SIGNATURE'] = this._computeSignature(timestamp, method, path, body);
    }

    return headers;
  }

  private serializeSignedOrder(order: SignedOrder): Record<string, unknown> {
    return {
      tokenID: order.tokenId,
      makerAmount: Math.round(order.size * 1e6).toString(),
      takerAmount: Math.round(order.size * order.price * 1e6).toString(),
      expiration: order.expiration.toString(),
      nonce: order.nonce,
      feeRateBps: order.feeRateBps.toString(),
      side: order.side,
      signatureType: order.signatureType,
      signature: order.signature,
      maker: order.maker,
    };
  }

   private _computeSignature(
     timestamp: string,
     method: string,
     path: string,
     body?: Record<string, unknown>,
   ): string {
     if (!this.apiSecret) throw new Error('API secret required for HMAC signature');
     const msg = timestamp + method.toUpperCase() + path + (body ? JSON.stringify(body) : '');
     return createHmac('sha256', this.apiSecret).update(msg).digest('base64');
   }
}
