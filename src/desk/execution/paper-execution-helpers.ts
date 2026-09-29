/**
 * Paper Execution Helpers
 *
 * Buy/sell execution logic extracted from PaperExecutor.
 * Supports dynamic order book depth consumption, VWAP pricing,
 * partial fills, and fallback to scalar price with flat slippage.
 *
 * Phase 22 — Paper Trading Infrastructure
 */

import {
  type PaperTrade,
  type PaperPosition,
  type PaperAccount,
  type PaperExecutorConfig,
  type OrderbookSnapshot,
  type OrderbookLevel,
  upsertPosition,
  reducePosition,
} from './paper-position-tracker';

export interface BuyResult {
  trade: PaperTrade;
  newBalance: number;
  newPositions: PaperPosition[];
}

export interface SellResult {
  trade: PaperTrade;
  newBalance: number;
  realizedPnlDelta: number;
  winningTradesDelta: number;
  losingTradesDelta: number;
  newPositions: PaperPosition[];
}

interface ConsumedDepth {
  filledQty: number;
  totalNotional: number;
  executedPrice: number;
  fee: number;
  slippage: number;
  status: 'filled' | 'partial';
  actualQty: number;
}

function consumeDepth(
  levels: OrderbookLevel[],
  quantity: number,
  price: number,
  side: 'buy' | 'sell',
  feePercent: number,
): ConsumedDepth | null {
  const sorted = [...levels]
    .filter((l) => l.price > 0 && l.size > 0)
    .sort((a, b) => (side === 'buy' ? a.price - b.price : b.price - a.price));
  if (sorted.length === 0) return null;

  let remaining = quantity;
  let filledQty = 0;
  let totalNotional = 0;
  for (const level of sorted) {
    if (remaining <= 0) break;
    const fill = Math.min(remaining, level.size);
    totalNotional += fill * level.price;
    filledQty += fill;
    remaining -= fill;
  }
  if (filledQty <= 0) return null;

  const executedPrice = totalNotional / filledQty;
  const fee = totalNotional * feePercent;
  const refPrice = price > 0 ? price : sorted[0]!.price;
  const slippage = side === 'buy' ? executedPrice - refPrice : refPrice - executedPrice;
  const isFull = filledQty >= quantity - 1e-9;
  return {
    filledQty, totalNotional, executedPrice, fee, slippage,
    status: isFull ? 'filled' : 'partial',
    actualQty: isFull ? quantity : filledQty,
  };
}

function createEmptyTrade(symbol: string, side: 'buy' | 'sell', price: number): PaperTrade {
  return {
    id: `paper-${side}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol, side, quantity: 0, requestedPrice: price, executedPrice: price,
    fee: 0, slippage: 0, status: 'rejected', timestamp: Date.now(), pnl: 0,
  };
}

export function executeBuy(
  symbol: string,
  quantity: number,
  price: number,
  account: PaperAccount,
  positions: PaperPosition[],
  config: PaperExecutorConfig,
  orderbook?: OrderbookSnapshot,
): BuyResult {
  if (orderbook) {
    const depth = orderbook.asks ? consumeDepth(orderbook.asks, quantity, price, 'buy', config.feePercent) : null;
    if (!depth) {
      return { trade: createEmptyTrade(symbol, 'buy', price), newBalance: account.balance, newPositions: positions };
    }
    const trade: PaperTrade = {
      id: `paper-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol, side: 'buy', quantity: depth.actualQty, requestedPrice: price, executedPrice: depth.executedPrice,
      fee: depth.fee, slippage: depth.slippage, status: depth.status, timestamp: Date.now(),
    };
    return {
      trade,
      newBalance: account.balance - (depth.totalNotional + depth.fee),
      newPositions: upsertPosition(positions, symbol, 'long', depth.actualQty, depth.executedPrice, depth.executedPrice),
    };
  }

  const executedPrice = price + price * config.slippagePercent;
  const fee = quantity * executedPrice * config.feePercent;
  const trade: PaperTrade = {
    id: `paper-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol, side: 'buy', quantity, requestedPrice: price, executedPrice,
    fee, slippage: price * config.slippagePercent, status: 'filled', timestamp: Date.now(),
  };
  return {
    trade,
    newBalance: account.balance - (quantity * executedPrice + fee),
    newPositions: upsertPosition(positions, symbol, 'long', quantity, executedPrice, executedPrice),
  };
}

export function executeSell(
  symbol: string,
  quantity: number,
  price: number,
  account: PaperAccount,
  positions: PaperPosition[],
  config: PaperExecutorConfig,
  orderbook?: OrderbookSnapshot,
): SellResult {
  const position = positions.find((p) => p.symbol === symbol);
  if (!position) throw new Error(`No position found for ${symbol}`);

  if (orderbook) {
    const depth = orderbook.bids ? consumeDepth(orderbook.bids, quantity, price, 'sell', config.feePercent) : null;
    if (!depth) {
      return {
        trade: createEmptyTrade(symbol, 'sell', price),
        newBalance: account.balance, realizedPnlDelta: 0,
        winningTradesDelta: 0, losingTradesDelta: 0, newPositions: positions,
      };
    }
    const pnl = (depth.executedPrice - position.entryPrice) * depth.actualQty - depth.fee;
    const trade: PaperTrade = {
      id: `paper-sell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol, side: 'sell', quantity: depth.actualQty, requestedPrice: price, executedPrice: depth.executedPrice,
      fee: depth.fee, slippage: depth.slippage, status: depth.status, timestamp: Date.now(), pnl,
    };
    return {
      trade,
      newBalance: account.balance + (depth.totalNotional - depth.fee),
      realizedPnlDelta: pnl, winningTradesDelta: pnl > 0 ? 1 : 0, losingTradesDelta: pnl > 0 ? 0 : 1,
      newPositions: reducePosition(positions, symbol, depth.actualQty, depth.executedPrice),
    };
  }

  const executedPrice = price - price * config.slippagePercent;
  const fee = quantity * executedPrice * config.feePercent;
  const revenue = quantity * executedPrice - fee;
  const pnl = (executedPrice - position.entryPrice) * quantity - fee;
  const trade: PaperTrade = {
    id: `paper-sell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol, side: 'sell', quantity, requestedPrice: price, executedPrice,
    fee, slippage: price * config.slippagePercent, status: 'filled', timestamp: Date.now(), pnl,
  };
  return {
    trade,
    newBalance: account.balance + revenue,
    realizedPnlDelta: pnl, winningTradesDelta: pnl > 0 ? 1 : 0, losingTradesDelta: pnl > 0 ? 0 : 1,
    newPositions: reducePosition(positions, symbol, quantity, executedPrice),
  };
}
