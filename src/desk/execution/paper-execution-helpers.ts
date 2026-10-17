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
  upsertPosition,
  reducePosition,
} from './paper-position-tracker';
import {
  type ConsumedDepth,
  buildPaperTradeId,
  consumeDepth,
  createEmptyTrade,
} from './paper-executor-state-helpers';

export type { ConsumedDepth };
export { buildPaperTradeId, consumeDepth, createEmptyTrade };

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
      id: buildPaperTradeId('buy'),
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
    id: buildPaperTradeId('buy'),
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
      id: buildPaperTradeId('sell'),
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
    id: buildPaperTradeId('sell'),
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
