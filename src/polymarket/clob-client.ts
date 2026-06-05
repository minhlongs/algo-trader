/**
 * Polymarket CLOB Client — real SDK wrapper for trading.
 * Uses @polymarket/clob-client SDK for order book, pricing, and order management.
 */
import { ClobClient as SdkClobClient, Chain, Side } from '@polymarket/clob-client';
import { logger } from '../utils/logger.js';

export interface OrderBookLevel {
  /** Price as a string to match Polymarket CLOB SDK convention */
  price: string;
  /** Size as a string to match Polymarket CLOB SDK convention */
  size: string;
}

export interface RawOrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface PlaceOrderResult {
  orderId: string;
  status: string;
}

export interface OpenOrder {
  id: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  status: string;
}

const CLOB_HOST = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = Chain.POLYGON;

/**
 * Create an authenticated CLOB client from environment variables.
 * Requires: POLY_API_KEY, POLY_API_SECRET, POLY_PASSPHRASE, POLY_PRIVATE_KEY
 */
export function createClobClient(): SdkClobClient {
  const apiKey = process.env.POLY_API_KEY;
  const apiSecret = process.env.POLY_API_SECRET;
  const passphrase = process.env.POLY_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    logger.warn('POLY_API_KEY/SECRET/PASSPHRASE not set — read-only mode');
    return new SdkClobClient(CLOB_HOST, CHAIN_ID);
  }

  return new SdkClobClient(CLOB_HOST, CHAIN_ID, undefined, {
    key: apiKey,
    secret: apiSecret,
    passphrase,
  });
}

let _client: SdkClobClient | null = null;

function getClient(): SdkClobClient {
  if (!_client) _client = createClobClient();
  return _client;
}

/** Fetch order book for a token, normalized to our interface */
export async function getOrderBook(tokenId: string): Promise<RawOrderBook> {
  const client = getClient();
  const book = await client.getOrderBook(tokenId);
  return {
    bids: (book.bids ?? []).map(b => ({ price: String(b.price), size: String(b.size) })),
    asks: (book.asks ?? []).map(a => ({ price: String(a.price), size: String(a.size) })),
    timestamp: Date.now(),
  };
}

/** Get best price for a side */
export async function getPrice(tokenId: string, side: 'BUY' | 'SELL' = 'BUY'): Promise<number> {
  const client = getClient();
  const result = await client.getPrice(tokenId, side === 'BUY' ? Side.BUY : Side.SELL);
  return typeof result === 'object' ? parseFloat(result.price ?? '0') : parseFloat(String(result));
}

/** Get midpoint price */
export async function getMidPrice(tokenId: string): Promise<number> {
  const client = getClient();
  const result = await client.getMidpoint(tokenId);
  return typeof result === 'object' ? parseFloat(result.mid ?? '0') : parseFloat(String(result));
}

/** Get open orders for authenticated user */
export async function getOpenOrders(tokenId?: string): Promise<OpenOrder[]> {
  const client = getClient();
  const params = tokenId ? { asset_id: tokenId } : {};
  const response = await client.getOpenOrders(params);
  return (Array.isArray(response) ? response : []).map(o => ({
    id: o.id,
    tokenId: o.asset_id,
    side: o.side === Side.BUY ? 'BUY' as const : 'SELL' as const,
    price: parseFloat(o.price),
    size: parseFloat(o.original_size ?? o.size_matched ?? '0'),
    status: o.status ?? 'unknown',
  }));
}

/** Cancel an order by ID */
export async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    const client = getClient();
    await client.cancelOrder({ orderID: orderId });
    return true;
  } catch (err) {
    logger.error(`cancelOrder failed: ${orderId} - ${err}`);
    return false;
  }
}

export interface ClobClientInterface {
  getOrderBook(tokenId: string): Promise<RawOrderBook>;
  getPrice(tokenId: string): Promise<number>;
  getMidPrice(tokenId: string): Promise<number>;
}

/**
 * ClobClient type alias — strategies import this type for dependency injection.
 * Identical to ClobClientInterface; provided as a named export for clarity.
 */
export type ClobClient = ClobClientInterface;

export const clobClient: ClobClientInterface = {
  getOrderBook,
  getPrice,
  getMidPrice,
};
