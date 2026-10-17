/**
 * Paper Executor Order Fill, Slippage & State Helpers
 * Extracted from paper-execution-helpers.ts and paper-executor.ts
 * for pure orderbook depth consumption, trade record creation, and P&L state formatting.
 */

import {
  type PaperTrade,
  type PaperAccount,
  type PaperExecutorConfig,
  type OrderbookLevel,
  type PnlSummary,
  computePnlSummary,
} from './paper-position-tracker';

export interface ConsumedDepth {
  filledQty: number;
  totalNotional: number;
  executedPrice: number;
  fee: number;
  slippage: number;
  status: 'filled' | 'partial';
  actualQty: number;
}

export function buildPaperTradeId(side: 'buy' | 'sell'): string {
  return `paper-${side}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function consumeDepth(
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
    filledQty,
    totalNotional,
    executedPrice,
    fee,
    slippage,
    status: isFull ? 'filled' : 'partial',
    actualQty: isFull ? quantity : filledQty,
  };
}

export function createEmptyTrade(symbol: string, side: 'buy' | 'sell', price: number): PaperTrade {
  return {
    id: buildPaperTradeId(side),
    symbol,
    side,
    quantity: 0,
    requestedPrice: price,
    executedPrice: price,
    fee: 0,
    slippage: 0,
    status: 'rejected',
    timestamp: Date.now(),
    pnl: 0,
  };
}

export function buildExecutorConfig(config?: Partial<PaperExecutorConfig>): PaperExecutorConfig {
  return {
    initialBalance: 10_000,
    slippagePercent: 0.001,
    feePercent: 0.001,
    simulateFillRate: 0.95,
    ...config,
  };
}

export function buildPnlSummaryWithReserves(
  account: PaperAccount,
  tradeHistory: PaperTrade[],
  initialBalance: number,
): PnlSummary {
  const summary = computePnlSummary(account, tradeHistory, initialBalance);
  return {
    ...summary,
    cashReserves: account.cashReserves ?? account.balance,
    marginUsed: account.marginUsed ?? 0,
  };
}
