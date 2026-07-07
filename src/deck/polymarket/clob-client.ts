/**
 * Polymarket CLOB Client — stub implementation.
 * Replaces unavailable @polymarket/clob-client package.
 * TODO: Install @polymarket/clob-client-v2 and wire real auth.
 */

import { logger } from '../../shared/utils/logger';

// ── Local type stubs replacing unavailable @polymarket/clob-client ──────────

export enum Chain {
  POLYGON = 137,
  ETHEREUM = 1,
}

export enum Side {
  BUY = 'BUY',
  SELL = 'SELL',
}

interface SdkClobClient {
  getOrderBook(tokenId: string): Promise<{ bids?: OrderBookLevel[]; asks?: OrderBookLevel[] }>;
  getPrice(tokenId: string, side: string): Promise<string>;
  getMidpoint(tokenId: string): Promise<string>;
  getOpenOrders(params?: { asset_id?: string }): Promise<Record<string, unknown>[]>;
  cancelOrder(params: { orderID: string }): Promise<void>;
}

const CLOB_HOST = process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com';

// ── Env var resolution (POLYMARKET_* preferred, POLY_* fallback) ─────────────

function resolveEnvVar(newName: string, oldName: string): string | undefined {
  const newVal = process.env[newName];
  if (newVal) return newVal;
  const oldVal = process.env[oldName];
  if (oldVal) {
    logger.warn(`[ClobClient] Deprecated env var ${oldName} used — switch to ${newName}`);
    return oldVal;
  }
  return undefined;
}

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price: string;
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

export interface ClobClientInterface {
  getOrderBook(tokenId: string): Promise<RawOrderBook>;
  getPrice(tokenId: string): Promise<number>;
  getMidPrice(tokenId: string): Promise<number>;
}

export type ClobClient = ClobClientInterface;

// ── Stub implementation ──────────────────────────────────────────────────────

function createStubClient(): SdkClobClient {
  return {
    async getOrderBook(): Promise<{ bids?: OrderBookLevel[]; asks?: OrderBookLevel[] }> {
      return { bids: [], asks: [] };
    },
    async getPrice(): Promise<string> {
      return '0';
    },
    async getMidpoint(): Promise<string> {
      return '0';
    },
    async getOpenOrders(): Promise<Record<string, unknown>[]> {
      return [];
    },
    async cancelOrder(): Promise<void> {
      // no-op
    },
  };
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createClobClient(): SdkClobClient {
  const apiKey = resolveEnvVar('POLYMARKET_API_KEY', 'POLY_API_KEY');
  const apiSecret = resolveEnvVar('POLYMARKET_API_SECRET', 'POLY_API_SECRET');
  const passphrase = resolveEnvVar('POLYMARKET_API_PASSPHRASE', 'POLY_PASSPHRASE');

  logger.info('[ClobClient] Using stub client (SDK not installed)');
  return createStubClient();
}

let _client: SdkClobClient | null = null;

function getClient(): SdkClobClient {
  if (!_client) _client = createClobClient();
  return _client;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getOrderBook(tokenId: string): Promise<RawOrderBook> {
  const book = await getClient().getOrderBook(tokenId);
  return {
    bids: (book.bids ?? []).map(b => ({ price: String(b.price ?? '0'), size: String(b.size ?? '0') })),
    asks: (book.asks ?? []).map(a => ({ price: String(a.price ?? '0'), size: String(a.size ?? '0') })),
    timestamp: Date.now(),
  };
}

export async function getPrice(tokenId: string): Promise<number> {
  const val = await getClient().getPrice(tokenId, 'BUY');
  return parseFloat(String(val));
}

export async function getMidPrice(tokenId: string): Promise<number> {
  const val = await getClient().getMidpoint(tokenId);
  return parseFloat(String(val));
}

export async function getOpenOrders(tokenId?: string): Promise<OpenOrder[]> {
  const params = tokenId ? { asset_id: tokenId } : {};
  const response = await getClient().getOpenOrders(params);
  return (Array.isArray(response) ? response : []).map((o: Record<string, unknown>) => ({
    id: String(o.id ?? ''),
    tokenId: String(o.asset_id ?? ''),
    side: o.side === Side.BUY ? 'BUY' as const : 'SELL' as const,
    price: parseFloat(String(o.price ?? '0')),
    size: parseFloat(String(o.original_size ?? o.size_matched ?? '0')),
    status: String(o.status ?? 'unknown'),
  }));
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

export const clobClient: ClobClientInterface = {
  getOrderBook,
  getPrice,
  getMidPrice,
};
