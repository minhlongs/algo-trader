/**
 * Paper Execution Helpers
 *
 * Buy/sell execution logic extracted from PaperExecutor.
 * Pure functions that compute trade records and account updates.
 * Caller applies state mutations.
 *
 * Phase 22 — Paper Trading Infrastructure
 */

import {
  type PaperTrade,
  type PaperPosition,
  type PaperAccount,
  type PaperExecutorConfig,
  upsertPosition,
  reducePosition,
} from './paper-position-tracker';

export interface BuyResult {
  trade: PaperTrade;
  newBalance: number;
  newPositions: PaperPosition[];
}

export function executeBuy(
  symbol: string,
  quantity: number,
  price: number,
  account: PaperAccount,
  positions: PaperPosition[],
  config: PaperExecutorConfig,
): BuyResult {
  const slippage = price * config.slippagePercent;
  const executedPrice = price + slippage;
  const fee = quantity * executedPrice * config.feePercent;
  const totalCost = quantity * executedPrice + fee;

  const trade: PaperTrade = {
    id: `paper-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    side: 'buy',
    quantity,
    requestedPrice: price,
    executedPrice,
    fee,
    slippage,
    status: 'filled',
    timestamp: Date.now(),
  };

  const newBalance = account.balance - totalCost;
  const newPositions = upsertPosition(positions, symbol, 'long', quantity, executedPrice, executedPrice);

  return { trade, newBalance, newPositions };
}

export interface SellResult {
  trade: PaperTrade;
  newBalance: number;
  realizedPnlDelta: number;
  winningTradesDelta: number;
  losingTradesDelta: number;
  newPositions: PaperPosition[];
}

export function executeSell(
  symbol: string,
  quantity: number,
  price: number,
  account: PaperAccount,
  positions: PaperPosition[],
  config: PaperExecutorConfig,
): SellResult {
  const position = positions.find((p) => p.symbol === symbol);
  if (!position) {
    throw new Error(`No position found for ${symbol}`);
  }

  const slippage = price * config.slippagePercent;
  const executedPrice = price - slippage;
  const fee = quantity * executedPrice * config.feePercent;
  const revenue = quantity * executedPrice - fee;
  const pnl = (executedPrice - position.entryPrice) * quantity - fee;

  const trade: PaperTrade = {
    id: `paper-sell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    side: 'sell',
    quantity,
    requestedPrice: price,
    executedPrice,
    fee,
    slippage,
    status: 'filled',
    timestamp: Date.now(),
    pnl,
  };

  const newBalance = account.balance + revenue;
  const newPositions = reducePosition(positions, symbol, quantity, executedPrice);

  return {
    trade,
    newBalance,
    realizedPnlDelta: pnl,
    winningTradesDelta: pnl > 0 ? 1 : 0,
    losingTradesDelta: pnl > 0 ? 0 : 1,
    newPositions,
  };
}
