/**
 * Real Trade Ledger — actual Polymarket trades and positions for any wallet.
 * Public data, no auth. Shows REAL P&L, not simulated.
 *
 * Uses Data API v2 (`/v2/trades`, `/v2/positions`). The v1 routes (`/trades`,
 * `/positions`) were retired by Polymarket and now answer HTTP 410.
 *
 * Usage:
 *   const ledger = await fetchRealTrades('0xABC...');
 *   printRealLedger(ledger);
 */

import { logger } from '../../shared/utils/logger';
import {
  createPolymarketDataApiClient,
  type RealPosition,
  type PolymarketDataApiClient,
} from './polymarket-data-api-client';

export type { RealPosition };

export interface RealTrade {
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  outcome: string; // "Yes" | "No" | "Up" | "Down" etc.
  title: string;
  slug: string;
  timestamp: number;
  transactionHash: string;
  wallet: string;
}

export interface RealLedger {
  wallet: string;
  trades: RealTrade[];
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  totalVolume: number;
  fetchedAt: number;
}

export interface RealLedgerOptions {
  client?: PolymarketDataApiClient;
  fetchImpl?: typeof fetch;
}

function resolveClient(options: RealLedgerOptions): PolymarketDataApiClient {
  return options.client ?? createPolymarketDataApiClient({ fetchImpl: options.fetchImpl });
}

/** Fetch real trades for a Polymarket wallet. */
export async function fetchRealTrades(
  wallet: string,
  limit = 100,
  options: RealLedgerOptions = {},
): Promise<RealLedger> {
  const { trades: rows } = await resolveClient(options).fetchTrades({ wallet, limit });

  const trades: RealTrade[] = rows.map((row) => ({
    side: row.side,
    price: row.price,
    size: row.size,
    outcome: row.outcome,
    title: row.title,
    slug: row.slug,
    timestamp: Math.floor(row.t / 1000),
    transactionHash: row.transactionHash,
    wallet,
  }));

  let buys = 0;
  let sells = 0;
  let volume = 0;
  for (const trade of trades) {
    if (trade.side === 'BUY') buys += 1;
    else sells += 1;
    volume += trade.size * trade.price;
  }

  return {
    wallet,
    trades,
    totalTrades: trades.length,
    totalBuys: buys,
    totalSells: sells,
    totalVolume: volume,
    fetchedAt: Date.now(),
  };
}

/** Fetch real open positions for a wallet. Transport failure yields `[]`. */
export async function fetchRealPositions(wallet: string, options: RealLedgerOptions = {}): Promise<RealPosition[]> {
  try {
    return await resolveClient(options).fetchPositions(wallet);
  } catch (err) {
    logger.warn('[RealTradeLedger] Position fetch failed', { wallet, err: String(err) });
    return [];
  }
}

/** Print formatted ledger to logger. */
export function printRealLedger(ledger: RealLedger): void {
  logger.info('═══ POLYMARKET REAL TRADE LEDGER ═══');
  logger.info(`Wallet: ${ledger.wallet}`);
  logger.info(`Total: ${ledger.totalTrades} trades | Buys: ${ledger.totalBuys} | Sells: ${ledger.totalSells}`);
  logger.info(`Volume: $${ledger.totalVolume.toFixed(2)}`);
  logger.info('─── Recent Trades ───');
  for (const trade of ledger.trades.slice(0, 20)) {
    const date = new Date(trade.timestamp * 1000).toISOString().substring(0, 16);
    logger.info(
      `  ${date} ${trade.side} ${trade.outcome} @${trade.price.toFixed(3)} size:${trade.size.toFixed(2)} ${trade.title.substring(0, 40)}`,
    );
  }
}

/** CLI-friendly: fetch + print for any wallet. */
export async function showRealLedger(wallet: string): Promise<void> {
  logger.info(`Fetching real trades for ${wallet}...`);
  const ledger = await fetchRealTrades(wallet);
  const positions = await fetchRealPositions(wallet);
  printRealLedger(ledger);
  if (positions.length > 0) {
    logger.info('─── Open Positions ───');
    for (const position of positions) {
      logger.info(
        `  ${position.outcome} size:${position.size} avg:${position.avgPrice.toFixed(3)} cur:${position.currentPrice.toFixed(3)} pnl:$${position.unrealizedPnl.toFixed(2)} ${position.title.substring(0, 40)}`,
      );
    }
  }
}
