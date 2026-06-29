/**
 * Real Trade Ledger — fetch actual Polymarket trades for any wallet
 * Public API, no auth needed. Shows REAL P&L, not simulated.
 *
 * Usage:
 *   const ledger = await fetchRealTrades('0xABC...');
 *   printRealLedger(ledger);
 */

import { logger } from '../shared/utils/logger';

const DATA_API = 'https://data-api.polymarket.com';

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

export interface RealPosition {
  conditionId: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
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

/** Fetch real trades for a Polymarket wallet */
export async function fetchRealTrades(wallet: string, limit = 100): Promise<RealLedger> {
  const url = `${DATA_API}/trades?maker=${wallet}&limit=${limit}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`Polymarket API ${resp.status}`);

  const raw = (await resp.json()) as Array<Record<string, unknown>>;

  const trades: RealTrade[] = raw.map(t => ({
    side: String(t.side || 'BUY') as 'BUY' | 'SELL',
    price: Number(t.price || 0),
    size: Number(t.size || 0),
    outcome: String(t.outcome || ''),
    title: String(t.title || ''),
    slug: String(t.slug || ''),
    timestamp: Number(t.timestamp || 0),
    transactionHash: String(t.transactionHash || ''),
    wallet,
  }));

  let buys = 0, sells = 0, vol = 0;
  for (const t of trades) {
    if (t.side === 'BUY') buys++; else sells++;
    vol += t.size * t.price;
  }

  return { wallet, trades, totalTrades: trades.length, totalBuys: buys, totalSells: sells, totalVolume: vol, fetchedAt: Date.now() };
}

/** Fetch real positions for a wallet */
export async function fetchRealPositions(wallet: string): Promise<RealPosition[]> {
  try {
    const url = `${DATA_API}/positions?user=${wallet}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) return [];
    const raw = (await resp.json()) as Array<Record<string, unknown>>;
    return raw.map(p => ({
      conditionId: String(p.conditionId || ''),
      title: String(p.title || ''),
      outcome: String(p.outcome || ''),
      size: Number(p.size || 0),
      avgPrice: Number(p.avgPrice || 0),
      currentPrice: Number(p.currentPrice || p.price || 0),
      unrealizedPnl: Number(p.unrealizedPnl || 0),
    }));
  } catch { return []; }
}

/** Print formatted ledger to logger */
export function printRealLedger(ledger: RealLedger): void {
  logger.info('═══ POLYMARKET REAL TRADE LEDGER ═══');
  logger.info(`Wallet: ${ledger.wallet}`);
  logger.info(`Total: ${ledger.totalTrades} trades | Buys: ${ledger.totalBuys} | Sells: ${ledger.totalSells}`);
  logger.info(`Volume: $${ledger.totalVolume.toFixed(2)}`);
  logger.info('─── Recent Trades ───');
  for (const t of ledger.trades.slice(0, 20)) {
    const date = new Date(t.timestamp * 1000).toISOString().substring(0, 16);
    logger.info(`  ${date} ${t.side} ${t.outcome} @${t.price.toFixed(3)} size:${t.size.toFixed(2)} ${t.title.substring(0, 40)}`);
  }
}

/** CLI-friendly: fetch + print for any wallet */
export async function showRealLedger(wallet: string): Promise<void> {
  logger.info(`Fetching real trades for ${wallet}...`);
  const ledger = await fetchRealTrades(wallet);
  const positions = await fetchRealPositions(wallet);
  printRealLedger(ledger);
  if (positions.length > 0) {
    logger.info('─── Open Positions ───');
    for (const p of positions) {
      logger.info(`  ${p.outcome} size:${p.size} avg:${p.avgPrice.toFixed(3)} cur:${p.currentPrice.toFixed(3)} pnl:$${p.unrealizedPnl.toFixed(2)} ${p.title.substring(0, 40)}`);
    }
  }
}
