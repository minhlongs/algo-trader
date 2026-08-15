/**
 * Polymarket CLOB Client — real SDK wrapper.
 * Converts SDK string prices/sizes to match strategy consumer expectations.
 */

import { ClobClient as PolymarketClobClient, Chain, Side } from '@polymarket/clob-client';
import { logger } from '../../shared/utils/logger';

// SDK is ESM with .ts imports in .d.ts — TS commonjs resolver may lose types.
// Define the shape we rely on locally so the compiler doesn't widen to `unknown`.
interface SdkOrderBook {
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
}

// Re-export SDK enums so downstream consumers don't need direct SDK dependency
export { Chain, Side };

// ── Public API types ────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface RawOrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface ClobClientInterface {
  getOrderBook(tokenId: string): Promise<RawOrderBook>;
  getPrice(tokenId: string, side?: string): Promise<number>;
  getMidPrice(tokenId: string): Promise<number>;
}

/** Type alias — strategies import this name */
export type ClobClient = ClobClientInterface;

// ── SDK singleton (lazy) ────────────────────────────────────────────────────

const CLOB_HOST = process.env['POLY_CLOB_HOST'] || 'https://clob.polymarket.com';

let _clob: PolymarketClobClient | null = null;

function getClient(): PolymarketClobClient {
  if (!_clob) {
    _clob = new PolymarketClobClient(CLOB_HOST, Chain.POLYGON);
    logger.info(`Polymarket CLOB client initialized → ${CLOB_HOST} (chain ${Chain.POLYGON})`);
  }
  return _clob;
}

// ── Public functions ────────────────────────────────────────────────────────

export async function getOrderBook(tokenId: string): Promise<RawOrderBook> {
  try {
    const sdkBook = await getClient().getOrderBook(tokenId) as unknown as {
      bids?: { price: string | number; size: string | number }[];
      asks?: { price: string | number; size: string | number }[];
    };
    return {
      bids: (sdkBook.bids ?? []).map(l => ({
        price: String(l.price ?? '0'),
        size: String(l.size ?? '0'),
      })),
      asks: (sdkBook.asks ?? []).map(l => ({
        price: String(l.price ?? '0'),
        size: String(l.size ?? '0'),
      })),
      timestamp: Date.now(),
    };
  } catch (err) {
    logger.error(`getOrderBook failed: ${tokenId} — ${err}`);
    return { bids: [], asks: [], timestamp: Date.now() };
  }
}

export async function getPrice(tokenId: string, side?: string): Promise<number> {
  try {
    const val = await getClient().getPrice(tokenId, side ?? Side.BUY);
    return Number(val);
  } catch (err) {
    logger.error(`getPrice failed: ${tokenId} — ${err}`);
    throw err;
  }
}

export async function getMidPrice(tokenId: string): Promise<number> {
  try {
    const mid = await getClient().getMidpoint(tokenId);
    return Number(mid);
  } catch (err) {
    logger.error(`getMidPrice failed: ${tokenId} — ${err}`);
    throw err;
  }
}

export async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    await getClient().cancelOrder({ orderID: orderId });
    return true;
  } catch (err) {
    logger.error(`cancelOrder failed: ${orderId} — ${err}`);
    return false;
  }
}

// ── Singleton export (backward-compatible) ──────────────────────────────────

export const clobClient: ClobClientInterface = {
  getOrderBook,
  getPrice,
  getMidPrice,
};
