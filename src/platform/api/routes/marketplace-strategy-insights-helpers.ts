/**
 * Marketplace Strategy Insights Helpers
 * Pure validation, pagination, and database row mapping for strategy insights & backtests.
 */

import type { BacktestTrade } from '../../../shared/backtesting/backtest-runner';

export interface RawBacktestTradeInput {
  entryTimestamp: number;
  exitTimestamp: number;
  pnlUsd: number;
  entryPrice: number;
  exitPrice: number;
  size: number;
  side: string;
}

export function paginateStrategyReviews<T>(allReviews: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  const reviews = allReviews.slice(start, start + limit);
  return {
    data: reviews,
    total: allReviews.length,
    page,
    limit,
    totalPages: Math.ceil(allReviews.length / limit),
  };
}

export function validateBacktestTrades(
  trades: unknown
): { valid: true; trades: BacktestTrade[] } | { valid: false; message: string } {
  if (!trades || !Array.isArray(trades) || trades.length === 0) {
    return { valid: false, message: 'trades array is required and must not be empty' };
  }

  for (const t of trades as Array<Partial<RawBacktestTradeInput>>) {
    if (
      typeof t.entryTimestamp !== 'number' ||
      typeof t.exitTimestamp !== 'number' ||
      typeof t.pnlUsd !== 'number' ||
      typeof t.entryPrice !== 'number' ||
      typeof t.exitPrice !== 'number' ||
      typeof t.size !== 'number'
    ) {
      return {
        valid: false,
        message: 'Each trade must have entryTimestamp, exitTimestamp, pnlUsd, entryPrice, exitPrice, size as numbers',
      };
    }
  }

  return { valid: true, trades: trades as unknown as BacktestTrade[] };
}

export function buildBacktestInsertValues(
  backtestId: string,
  strategyId: string,
  tenantId: string,
  result: {
    sharpeRatio?: number | null;
    maxDrawdown?: number | null;
    winRate?: number | null;
    totalPnlUsd: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalReturn?: number | null;
  },
  config?: Record<string, unknown>
): unknown[] {
  return [
    backtestId,
    strategyId,
    tenantId,
    result.sharpeRatio ?? null,
    result.maxDrawdown ?? null,
    result.winRate ?? null,
    result.totalPnlUsd,
    (result as unknown as { profitFactor?: number }).profitFactor ?? null,
    result.totalTrades,
    result.winningTrades,
    result.losingTrades,
    (result as unknown as { volatilityAnnual?: number }).volatilityAnnual ?? null,
    result.totalReturn ?? null,
    (config as unknown as { initialCapitalUsd?: number } | undefined)?.initialCapitalUsd ?? 10000,
    JSON.stringify(config ?? {}),
  ];
}

export function mapMarketplaceBacktestRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    sharpeRatio: row.sharpe_ratio,
    maxDrawdown: row.max_drawdown,
    winRate: row.win_rate,
    totalPnlUsd: row.total_pnl_usd,
    profitFactor: row.profit_factor,
    totalTrades: row.total_trades,
    winningTrades: row.winning_trades,
    losingTrades: row.losing_trades,
    volatility: row.volatility,
    totalReturn: row.total_return,
    createdAt: row.created_at,
  };
}
