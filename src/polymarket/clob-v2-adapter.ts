/**
 * Polymarket CLOB v2 Adapter — wraps @polymarket/clob-client-v2 for CashClaw.
 * Uses viem WalletClient for L1 signing; HMAC creds for L2 order operations.
 */

import { ClobClient, Chain, Side, OrderType } from '@polymarket/clob-client-v2';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { logger } from '../shared/utils/logger';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface RawOrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface MarketPrice {
  yes: number;
  no: number;
}

export interface PlaceOrderResult {
  orderId: string;
  status: string;
}

export interface OrderRecord {
  id: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLOB_HOST = 'https://clob.polymarket.com';
const CHAIN_ID = Chain.POLYGON;

// ---------------------------------------------------------------------------
// ClobV2Adapter
// ---------------------------------------------------------------------------

export class ClobV2Adapter {
  private client: ClobClient;

  constructor() {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const apiKey = process.env.POLYMARKET_API_KEY;
    const apiSecret = process.env.POLYMARKET_API_SECRET;
    const passphrase = process.env.POLYMARKET_PASSPHRASE;

    // Build viem WalletClient for L1 EIP-712 signing if private key is provided
    let signer: ReturnType<typeof createWalletClient> | undefined;
    if (privateKey) {
      const account = privateKeyToAccount(
        (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`,
      );
      signer = createWalletClient({
        account,
        chain: polygon,
        transport: http(),
      });
    }

    // L2 HMAC creds for authenticated order operations
    const creds =
      apiKey && apiSecret && passphrase
        ? { key: apiKey, secret: apiSecret, passphrase }
        : undefined;

    if (!signer && !creds) {
      logger.warn('[ClobV2Adapter] No credentials — read-only mode');
    }

    this.client = new ClobClient({
      host: CLOB_HOST,
      chain: CHAIN_ID,
      signer,
      creds,
    });
  }

  /** Fetch active markets with optional pagination limit */
  async getMarkets(limit = 100): Promise<unknown[]> {
    const collected: unknown[] = [];
    let cursor: string | undefined;

    while (collected.length < limit) {
      const page = await this.client.getMarkets(cursor);
      const items: unknown[] = Array.isArray(page.data) ? page.data : [];
      collected.push(...items);
      if (!page.next_cursor || page.next_cursor === 'LTE=') break;
      cursor = page.next_cursor;
    }

    return collected.slice(0, limit);
  }

  /** Fetch order book for a token ID */
  async getOrderbook(tokenId: string): Promise<RawOrderBook> {
    const book = await this.client.getOrderBook(tokenId);
    return {
      bids: (book.bids ?? []).map(b => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      })),
      asks: (book.asks ?? []).map(a => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      })),
      timestamp: Date.now(),
    };
  }

  /** Get YES and NO mid prices for a token */
  async getPrice(tokenId: string): Promise<MarketPrice> {
    const [buyRaw, sellRaw] = await Promise.all([
      this.client.getPrice(tokenId, Side.BUY),
      this.client.getPrice(tokenId, Side.SELL),
    ]);

    const yes = typeof buyRaw === 'object'
      ? parseFloat((buyRaw as { price?: string }).price ?? '0')
      : parseFloat(String(buyRaw));
    const no = typeof sellRaw === 'object'
      ? parseFloat((sellRaw as { price?: string }).price ?? '0')
      : parseFloat(String(sellRaw));

    return { yes, no };
  }

  /** Place a GTC limit order — returns orderId */
  async placeLimitOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number,
  ): Promise<PlaceOrderResult> {
    const response = await this.client.createAndPostOrder({
      tokenID: tokenId,
      side: side === 'BUY' ? Side.BUY : Side.SELL,
      price,
      size,
    });
    logger.info('[ClobV2Adapter] Limit order placed', { tokenId, side, price, size, response });
    return {
      orderId: String(response?.orderID ?? response?.id ?? ''),
      status: String(response?.status ?? 'submitted'),
    };
  }

  /** Place a FOK market order — fills immediately or cancels */
  async placeMarketOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    amount: number,
  ): Promise<PlaceOrderResult> {
    const response = await this.client.createAndPostMarketOrder({
      tokenID: tokenId,
      side: side === 'BUY' ? Side.BUY : Side.SELL,
      amount,
      orderType: OrderType.FOK,
    });
    logger.info('[ClobV2Adapter] Market order placed', { tokenId, side, amount, response });
    return {
      orderId: String(response?.orderID ?? response?.id ?? ''),
      status: String(response?.status ?? 'submitted'),
    };
  }

  /** Cancel an order by ID */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.cancelOrder({ orderID: orderId });
      return true;
    } catch (err) {
      logger.error('[ClobV2Adapter] cancelOrder failed', { orderId, err });
      return false;
    }
  }

  /** Get open orders for the authenticated user */
  async getOpenOrders(tokenId?: string): Promise<OrderRecord[]> {
    const params = tokenId ? { asset_id: tokenId } : {};
    const response = await this.client.getOpenOrders(params);
    const orders = Array.isArray(response) ? response : [];
    return orders.map(o => ({
      id: o.id,
      tokenId: o.asset_id,
      side: o.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
      price: parseFloat(o.price),
      size: parseFloat(o.original_size ?? '0'),
      status: o.status ?? 'unknown',
    }));
  }

  /** Create or derive L2 API credentials from L1 wallet signature */
  async getApiKeys() {
    return this.client.createOrDeriveApiKey();
  }
}
