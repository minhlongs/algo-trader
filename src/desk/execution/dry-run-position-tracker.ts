/**
 * Dry-Run Position Tracker
 *
 * Types, position management, and Redis persistence helpers for dry-run execution.
 * Pure functions with Redis dependency injected. Used by DryRunExecutor.
 *
 * Week 3-4: Risk Management - Simulated order tracking
 */

import { type RedisClientType } from '../../redis';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DryRunConfig {
  initialBalance: number;
  slippagePercent: number;
  feePercent: number;
  simulateFillRate: number; // 0-1, probability of order fill
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

// ─── Redis Key Constants ─────────────────────────────────────────────────────

export const DRY_RUN_KEYS = {
  ACCOUNT: 'paper_trading:account',
  POSITIONS: 'paper_trading:positions',
  TRADES: 'paper_trading:trades',
} as const;

// ─── Account Factory ─────────────────────────────────────────────────────────

export function createDefaultAccount(config: DryRunConfig, initialBalance?: number): PaperAccount {
  return {
    balance: initialBalance || config.initialBalance,
    equity: initialBalance || config.initialBalance,
    unrealizedPnl: 0,
    realizedPnl: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
  };
}

// ─── Position Management (pure functions, Redis calls in executor) ───────────

/** Add to or create a position (averages entry price). Mutates the array in-place. */
export function updatePositionInPlace(
  positions: PaperPosition[],
  symbol: string,
  side: 'long' | 'short',
  quantity: number,
  entryPrice: number,
  currentPrice: number,
): void {
  const existing = positions.find(p => p.symbol === symbol && p.side === side);
  if (existing) {
    const totalQuantity = existing.quantity + quantity;
    const avgPrice = ((existing.quantity * existing.entryPrice) + (quantity * entryPrice)) / totalQuantity;
    existing.quantity = totalQuantity;
    existing.entryPrice = avgPrice;
    existing.currentPrice = currentPrice;
    existing.unrealizedPnl = (currentPrice - avgPrice) * totalQuantity;
  } else {
    positions.push({
      symbol, side, quantity, entryPrice, currentPrice,
      unrealizedPnl: (currentPrice - entryPrice) * quantity,
      openedAt: Date.now(),
    });
  }
}

/** Reduce or remove a position after a partial/full close. Mutates array in-place. */
export function reducePositionInPlace(
  positions: PaperPosition[],
  symbol: string,
  quantity: number,
  currentPrice: number,
): void {
  const position = positions.find(p => p.symbol === symbol);
  if (!position) return;

  position.quantity -= quantity;
  position.currentPrice = currentPrice;
  position.unrealizedPnl = (currentPrice - position.entryPrice) * position.quantity;

  if (position.quantity <= 0) {
    const index = positions.indexOf(position);
    if (index > -1) positions.splice(index, 1);
  }
}

/** Mark-to-market: update all position prices. Mutates array in-place. */
export function updatePositionsPrices(
  positions: PaperPosition[],
  prices: Map<string, number>,
): void {
  for (const position of positions) {
    if (prices.has(position.symbol)) {
      position.currentPrice = prices.get(position.symbol)!;
      position.unrealizedPnl = (position.currentPrice - position.entryPrice) * position.quantity;
    }
  }
}

// ─── P&L Calculation ─────────────────────────────────────────────────────────

export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
}

export function computePerformance(
  account: PaperAccount,
  initialBalance: number,
  trades: PaperTrade[],
): PerformanceMetrics {
  const totalReturn = account.realizedPnl + account.unrealizedPnl;
  const totalReturnPercent = (totalReturn / initialBalance) * 100;
  const winRate = account.totalTrades > 0
    ? (account.winningTrades / account.totalTrades) * 100
    : 0;

  const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
  const losingTrades = trades.filter(t => (t.pnl || 0) < 0);
  const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  const dailyReturns = calculateDailyReturns(trades);
  const avgReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    : 0;
  const stdDev = Math.sqrt(
    dailyReturns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / dailyReturns.length
  ) || 1;
  const sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252);

  return { totalReturn, totalReturnPercent, winRate, profitFactor, sharpeRatio };
}

export function calculateDailyReturns(trades: PaperTrade[]): number[] {
  const dailyPnl = new Map<string, number>();
  for (const trade of trades) {
    const date = new Date(trade.timestamp).toISOString().split('T')[0];
    const current = dailyPnl.get(date) || 0;
    dailyPnl.set(date, current + (trade.pnl || 0));
  }
  return Array.from(dailyPnl.values());
}

// ─── Redis Persistence Helpers ────────────────────────────────────────────────

export async function saveAccountToRedis(
  redis: RedisClientType,
  account: PaperAccount,
): Promise<void> {
  await redis.set(DRY_RUN_KEYS.ACCOUNT, JSON.stringify(account));
}

export async function saveTradeToRedis(
  redis: RedisClientType,
  trade: PaperTrade,
): Promise<void> {
  await redis.lpush(DRY_RUN_KEYS.TRADES, JSON.stringify(trade));
  await redis.ltrim(DRY_RUN_KEYS.TRADES, 0, 999);
}

export async function savePositionsToRedis(
  redis: RedisClientType,
  positions: PaperPosition[],
): Promise<void> {
  await redis.set(DRY_RUN_KEYS.POSITIONS, JSON.stringify(positions));
}

export async function loadPositionsFromRedis(
  redis: RedisClientType,
): Promise<PaperPosition[]> {
  const data = await redis.get(DRY_RUN_KEYS.POSITIONS);
  if (!data) return [];
  return JSON.parse(data) as PaperPosition[];
}

export async function loadAccountFromRedis(
  redis: RedisClientType,
): Promise<PaperAccount | null> {
  const data = await redis.get(DRY_RUN_KEYS.ACCOUNT);
  if (!data) return null;
  return JSON.parse(data) as PaperAccount;
}
