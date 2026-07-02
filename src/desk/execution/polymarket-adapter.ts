/**
 * Polymarket CLOB Execution Adapter
 * Bridges the algo-trader execution engine with Polymarket's REST CLOB API.
 * Docs: https://docs.polymarket.com/#clob-api
 *
 * Auth: POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_PASSPHRASE from process.env
 * (deprecated POLY_* equivalents still accepted with warning)
 * Base: https://clob.polymarket.com
 */

import { createHmac } from 'crypto';
import { PolymarketSigner, PolymarketOrder, SignedOrder } from './polymarket-signer';

const CLOB_BASE = 'https://clob.polymarket.com';

// ── Env var resolution (POLYMARKET_* preferred, POLY_* fallback) ──────────────

function resolveEnvVar(newName: string, oldName: string): string {
  const newVal = process.env[newName];
  if (newVal) return newVal;
  const oldVal = process.env[oldName];
  if (oldVal) return oldVal;
  return '';
}

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
 */
export class PolymarketAdapter {
  private readonly apiUrl: string;
  private readonly signer: PolymarketSigner;
  private readonly apiKey: string;
  /** API secret for HMAC-SHA256 request signing */
  private readonly apiSecret: string;
  private readonly passphrase: string;

  /**
   * @param apiUrl - CLOB base URL (default: https://clob.polymarket.com)
   * @param signer - Configured PolymarketSigner instance
   */
  constructor(
    signer: PolymarketSigner,
    apiUrl: string = CLOB_BASE,
  ) {
    this.signer = signer;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.apiKey = resolveEnvVar('POLYMARKET_API_KEY', 'POLY_API_KEY');
    this.apiSecret = resolveEnvVar('POLYMARKET_API_SECRET', 'POLY_API_SECRET');
    this.passphrase = resolveEnvVar('POLYMARKET_PASSPHRASE', 'POLY_PASSPHRASE');
  }

  /**
   * Place a signed order on the CLOB.
   * @param order - Unsigned order params
   * @returns Order ID and status from CLOB
   */
  async placeOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
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

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers = this.buildHeaders(method, path, body);

    const init: RequestInit = {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const res = await fetch(url, init);

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Polymarket CLOB error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
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
      headers['POLY-SIGNATURE'] = this.computeSignature(timestamp, method, path, body);
    }

    return headers;
  }

  /** Serialize a SignedOrder to the CLOB POST /order body shape */
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

/**
 * Compute HMAC-SHA256 signature for Polymarket CLOB auth.
 * Signs: timestamp + METHOD + path + body
 */
private computeSignature(
  timestamp: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): string {
  const msg = timestamp + method.toUpperCase() + path + (body ? JSON.stringify(body) : '');
  return createHmac('sha256', this.apiSecret).update(msg).digest('hex');
}
}
