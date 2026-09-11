/**
 * Dry-Run Executor (Paper Trading Mode)
 * Week 3-4: Risk Management - Simulated orders with realistic P&L tracking
 *
 * Features:
 * - Simulates order execution without real trades
 * - Tracks virtual P&L, positions, and balance
 * - Applies realistic slippage and fees
 * - Persists state to Redis for recovery
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import {
  type DryRunConfig,
  type PaperPosition,
  type PaperTrade,
  type PaperAccount,
  type ExecutionResult,
  createDefaultAccount,
  updatePositionsPrices,
  saveAccountToRedis,
  savePositionsToRedis,
  loadPositionsFromRedis,
  loadAccountFromRedis,
  DRY_RUN_KEYS,
} from './dry-run-position-tracker';
import { executeDryRunBuy, executeDryRunSell } from './dry-run-order-simulator';

// Re-export types for consumers
export type {
  DryRunConfig,
  PaperPosition,
  PaperTrade,
  PaperAccount,
  ExecutionResult,
} from './dry-run-position-tracker';

export class DryRunExecutor {
  private redis: RedisClientType;
  private config: DryRunConfig;

  constructor(redis?: RedisClientType, config?: Partial<DryRunConfig>) {
    this.redis = redis || getRedisClient();
    this.config = {
      initialBalance: 10000,
      slippagePercent: 0.001,
      feePercent: 0.001,
      simulateFillRate: 0.95,
      ...config,
    };
  }

  async initialize(initialBalance?: number): Promise<PaperAccount> {
    const account = createDefaultAccount(this.config, initialBalance);
    await saveAccountToRedis(this.redis, account);
    await this.redis.del(DRY_RUN_KEYS.POSITIONS);
    await this.redis.del(DRY_RUN_KEYS.TRADES);
    logger.info(`[DryRun] Account initialized with $${account.balance}`);
    return account;
  }

  async getAccount(): Promise<PaperAccount> {
    const account = await loadAccountFromRedis(this.redis);
    if (!account) return this.initialize();
    const positions = await this.getPositions();
    account.unrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    account.equity = account.balance + account.unrealizedPnl;
    return account;
  }

  async buy(symbol: string, quantity: number, currentPrice: number): Promise<ExecutionResult> {
    const account = await this.getAccount();
    const positions = await this.getPositions();
    return executeDryRunBuy(this.redis, this.config, account, positions, symbol, quantity, currentPrice);
  }

  async sell(symbol: string, quantity: number, currentPrice: number): Promise<ExecutionResult> {
    const positions = await this.getPositions();
    return executeDryRunSell(this.redis, this.config, positions, () => this.getAccount(), symbol, quantity, currentPrice);
  }

  async getPositions(): Promise<PaperPosition[]> {
    return loadPositionsFromRedis(this.redis);
  }

  async getPosition(symbol: string): Promise<PaperPosition | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol) || null;
  }

  async getTradeHistory(limit: number = 50): Promise<PaperTrade[]> {
    const data = await this.redis.lrange(DRY_RUN_KEYS.TRADES, 0, limit - 1);
    return data.map((t) => JSON.parse(t) as PaperTrade);
  }

  async getPerformance(): Promise<{
    totalReturn: number;
    totalReturnPercent: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
  }> {
    const { computePerformance } = await import('./dry-run-position-tracker');
    const account = await this.getAccount();
    const trades = await this.getTradeHistory(1000);
    return computePerformance(account, this.config.initialBalance, trades);
  }

  async updatePrices(prices: Map<string, number>): Promise<PaperPosition[]> {
    const positions = await this.getPositions();
    updatePositionsPrices(positions, prices);
    await savePositionsToRedis(this.redis, positions);
    return positions;
  }

  async reset(): Promise<PaperAccount> {
    return this.initialize();
  }
}
