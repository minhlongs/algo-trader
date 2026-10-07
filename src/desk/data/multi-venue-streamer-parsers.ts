/**
 * Venue message parsing helpers for MultiVenueMarketStreamer
 */

import type { SupportedVenue, UnifiedOrderBook, UnifiedTrade } from './multi-venue-streamer-types';

export function parseVenueOrderBook(venue: SupportedVenue, msg: Record<string, unknown>): UnifiedOrderBook | null {
  if (venue === 'binance' && (msg.e === 'depthUpdate' || msg.lastUpdateId !== undefined)) {
    const bids = Array.isArray(msg.b) ? (msg.b as [string, string][]).map(([p, a]) => ({ price: parseFloat(p), amount: parseFloat(a) })) : [];
    const asks = Array.isArray(msg.a) ? (msg.a as [string, string][]).map(([p, a]) => ({ price: parseFloat(p), amount: parseFloat(a) })) : [];
    return {
      venue,
      symbol: String(msg.s ?? ''),
      timestamp: Number(msg.E ?? Date.now()),
      seq: Number(msg.u ?? msg.lastUpdateId ?? 0),
      bids,
      asks,
    };
  }

  if (venue === 'hyperliquid' && msg.channel === 'l2Book') {
    const data = msg.data as { coin: string; time: number; levels: [{ px: string; sz: string }[], { px: string; sz: string }[]] };
    if (data?.levels) {
      const bids = data.levels[0].map((l) => ({ price: parseFloat(l.px), amount: parseFloat(l.sz) }));
      const asks = data.levels[1].map((l) => ({ price: parseFloat(l.px), amount: parseFloat(l.sz) }));
      return { venue, symbol: data.coin, timestamp: data.time, seq: data.time, bids, asks };
    }
  }

  if (venue === 'polymarket' && (msg.event_type === 'book' || msg.bids || msg.asks)) {
    const bids = Array.isArray(msg.bids) ? (msg.bids as { price: string; size: string }[]).map((b) => ({ price: parseFloat(b.price), amount: parseFloat(b.size) })) : [];
    const asks = Array.isArray(msg.asks) ? (msg.asks as { price: string; size: string }[]).map((a) => ({ price: parseFloat(a.price), amount: parseFloat(a.size) })) : [];
    return { venue, symbol: String(msg.asset_id ?? msg.market ?? ''), timestamp: Date.now(), seq: Date.now(), bids, asks };
  }

  return null;
}

export function parseVenueTrade(venue: SupportedVenue, msg: Record<string, unknown>): UnifiedTrade | null {
  if (venue === 'binance' && msg.e === 'trade') {
    return {
      venue,
      symbol: String(msg.s ?? ''),
      side: msg.m ? 'sell' : 'buy',
      price: parseFloat(String(msg.p ?? '0')),
      amount: parseFloat(String(msg.q ?? '0')),
      timestamp: Number(msg.T ?? Date.now()),
      tradeId: String(msg.t ?? ''),
    };
  }

  if (venue === 'hyperliquid' && msg.channel === 'trades') {
    const trades = msg.data as Array<{ coin: string; side: string; px: string; sz: string; time: number; hash?: string; tid?: number }>;
    if (Array.isArray(trades) && trades.length > 0) {
      const t = trades[0];
      return {
        venue,
        symbol: t.coin,
        side: t.side === 'B' || t.side === 'buy' ? 'buy' : 'sell',
        price: parseFloat(t.px),
        amount: parseFloat(t.sz),
        timestamp: t.time,
        tradeId: t.hash ?? String(t.tid ?? Date.now()),
      };
    }
  }

  if (venue === 'polymarket' && (msg.event_type === 'last_trade_price' || msg.event_type === 'trade')) {
    return {
      venue,
      symbol: String(msg.asset_id ?? msg.market ?? ''),
      side: (msg.side === 'BUY' || msg.side === 'buy' ? 'buy' : 'sell'),
      price: parseFloat(String(msg.price ?? '0')),
      amount: parseFloat(String(msg.size ?? '0')),
      timestamp: Number(msg.timestamp ?? Date.now()),
      tradeId: String(msg.trade_id ?? `${Date.now()}`),
    };
  }

  return null;
}
