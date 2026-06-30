/**
 * Paper Position Tracker
 *
 * Types, position math, P&L calculation, and persistence helpers for paper trading.
 * Pure functions — no class state. Used by PaperExecutor.
 *
 * Phase 22 — Paper Trading Infrastructure
 */

import {
  appendJsonl,
  writeJsonState,
  readJsonState,
  cashclawPath,
} from '../../shared/persistence/file-store';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaperTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  requestedPrice: number;
  executedPrice: number;
  fee: number;
  slippage: number;
  status: 'filled' | 'rejected' | 'pending';
  timestamp: number;
  pnl?: number;
}

export interface PaperPosition {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface PaperAccount {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

export interface ExecutionResult {
  success: boolean;
  trade?: PaperTrade;
  message?: string;
  account?: PaperAccount;
}

export interface PaperExecutorConfig {
  initialBalance: number;
  slippagePercent: number;
  feePercent: number;
  simulateFillRate: number; // 0-1 probability of fill
}

export interface TradeSignal {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
}

// ─── Default Account ─────────────────────────────────────────────────────────

export function createDefaultAccount(config: PaperExecutorConfig, initialBalance?: number): PaperAccount {
  return {
    balance: initialBalance ?? config.initialBalance,
    equity: initialBalance ?? config.initialBalance,
    unrealizedPnl: 0,
    realizedPnl: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
  };
}

// ─── Position Management (pure functions) ────────────────────────────────────

/** Add to or create a position (averages entry price) */
export function upsertPosition(
  positions: PaperPosition[],
  symbol: string,
  side: 'long' | 'short',
  quantity: number,
  entryPrice: number,
  currentPrice: number,
): PaperPosition[] {
  const existing = positions.find((p) => p.symbol === symbol && p.side === side);
  if (existing) {
    const totalQty = existing.quantity + quantity;
    existing.entryPrice =
      (existing.quantity * existing.entryPrice + quantity * entryPrice) / totalQty;
    existing.quantity = totalQty;
    existing.currentPrice = currentPrice;
    existing.unrealizedPnl = (currentPrice - existing.entryPrice) * totalQty;
    return positions;
  }
  return [
    ...positions,
    {
      symbol,
      side,
      quantity,
      entryPrice,
      currentPrice,
      unrealizedPnl: (currentPrice - entryPrice) * quantity,
      openedAt: Date.now(),
    },
  ];
}

/** Reduce or remove a position after a partial/full close */
export function reducePosition(
  positions: PaperPosition[],
  symbol: string,
  quantity: number,
  currentPrice: number,
): PaperPosition[] {
  const pos = positions.find((p) => p.symbol === symbol);
  if (!pos) return positions;
  pos.quantity -= quantity;
  pos.currentPrice = currentPrice;
  pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
  if (pos.quantity <= 0.0001) {
    return positions.filter((p) => p.symbol !== symbol);
  }
  return positions;
}

/** Mark-to-market: update all position prices */
export function updatePositionsPrices(
  positions: PaperPosition[],
  prices: Map<string, number>,
): PaperPosition[] {
  for (const pos of positions) {
    if (prices.has(pos.symbol)) {
      pos.currentPrice = prices.get(pos.symbol)!;
      pos.unrealizedPnl = (pos.currentPrice - pos.entryPrice) * pos.quantity;
    }
  }
  return positions;
}

// ─── P&L Calculation ─────────────────────────────────────────────────────────

export function calcSharpeRatio(tradeHistory: PaperTrade[]): number {
  const daily = new Map<string, number>();
  for (const t of tradeHistory) {
    const day = new Date(t.timestamp).toISOString().split('T')[0]!;
    daily.set(day, (daily.get(day) ?? 0) + (t.pnl ?? 0));
  }
  const vals = Array.from(daily.values());
  if (vals.length < 2) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.map((v) => (v - avg) ** 2).reduce((a, b) => a + b, 0) / vals.length);
  if (std === 0) return 0;
  return (avg / std) * Math.sqrt(252);
}

export function calcMaxDrawdown(initialBalance: number, tradeHistory: PaperTrade[]): number {
  let peak = initialBalance;
  let maxDd = 0;
  let equity = initialBalance;
  for (const t of tradeHistory) {
    equity += t.pnl ?? 0;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

// ─── P&L Summary ─────────────────────────────────────────────────────────────

export interface PnlSummary {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  balance: number;
  equity: number;
}

export function computePnlSummary(
  account: PaperAccount,
  tradeHistory: PaperTrade[],
  initialBalance: number,
): PnlSummary {
  const wins = tradeHistory.filter((t) => (t.pnl ?? 0) > 0);
  const losses = tradeHistory.filter((t) => (t.pnl ?? 0) < 0);
  const totalWins = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const totalPnl = account.realizedPnl + account.unrealizedPnl;
  const winRate = account.totalTrades > 0 ? (account.winningTrades / account.totalTrades) * 100 : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
  const sharpe = calcSharpeRatio(tradeHistory);
  const maxDd = calcMaxDrawdown(initialBalance, tradeHistory);
  return {
    totalPnl, winRate, totalTrades: account.totalTrades,
    winningTrades: account.winningTrades, losingTrades: account.losingTrades,
    profitFactor, sharpeRatio: sharpe, maxDrawdown: maxDd,
    balance: account.balance, equity: account.equity,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export function persistPaperState(
  accountFile: string,
  positionsFile: string,
  tradesFile: string,
  account: PaperAccount,
  positions: PaperPosition[],
  tradeHistory: PaperTrade[],
): void {
  writeJsonState(accountFile, account);
  writeJsonState(positionsFile, positions);
  for (const trade of tradeHistory) {
    appendJsonl(tradesFile, trade);
  }
}

export function loadPaperState(
  accountFile: string,
  positionsFile: string,
  tradesFile: string,
): { account: PaperAccount | undefined; positions: PaperPosition[]; trades: PaperTrade[] } {
  const account = readJsonState<PaperAccount>(accountFile);
  const positions = readJsonState<PaperPosition[]>(positionsFile) ?? [];
  const trades: PaperTrade[] = [];
  return { account, positions, trades };
}
