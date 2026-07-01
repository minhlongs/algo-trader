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
  updatePositionInPlace,
  reducePositionInPlace,
  updatePositionsPrices,
  computePerformance,
  saveAccountToRedis,
  saveTradeToRedis,
  savePositionsToRedis,
  loadPositionsFromRedis,
  loadAccountFromRedis,
  DRY_RUN_KEYS,
} from './dry-run-position-tracker';

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

  constructor(
    redis?: RedisClientType,
    config?: Partial<DryRunConfig>
  ) {
    this.redis = redis || getRedisClient();
    this.config = {
      initialBalance: 10000,
      slippagePercent: 0.001,
      feePercent: 0.001,
      simulateFillRate: 0.95,
      ...config,
    };
  }

  /**
   * Initialize paper trading account
   */
  async initialize(initialBalance?: number): Promise<PaperAccount> {
    const account = createDefaultAccount(this.config, initialBalance);

    await saveAccountToRedis(this.redis, account);
    await this.redis.del(DRY_RUN_KEYS.POSITIONS);
    await this.redis.del(DRY_RUN_KEYS.TRADES);

    logger.info(`[DryRun] Account initialized with $${account.balance}`);
    return account;
  }

  /**
   * Get current account status
   */
  async getAccount(): Promise<PaperAccount> {
    const account = await loadAccountFromRedis(this.redis);
    if (!account) {
      return this.initialize();
    }

    // Update equity with unrealized P&L
    const positions = await this.getPositions();
    account.unrealizedPnl = positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);
    account.equity = account.balance + account.unrealizedPnl;

    return account;
  }

  /**
   * Execute simulated buy order
   */
  async buy(symbol: string, quantity: number, currentPrice: number): Promise<ExecutionResult> {
    const account = await this.getAccount();
    const requiredBalance = quantity * currentPrice;

    if (requiredBalance > account.balance) {
      return {
        success: false,
        message: `Insufficient balance: need $${requiredBalance.toFixed(2)}, have $${account.balance.toFixed(2)}`,
      };
    }

    if (Math.random() > this.config.simulateFillRate) {
      return { success: false, message: 'Order not filled (simulated market conditions)' };
    }

    const slippage = currentPrice * this.config.slippagePercent;
    const executedPrice = currentPrice + slippage;
    const fee = quantity * executedPrice * this.config.feePercent;
    const totalCost = (quantity * executedPrice) + fee;

    const trade: PaperTrade = {
      id: `paper-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      side: 'buy',
      quantity,
      requestedPrice: currentPrice,
      executedPrice,
      fee,
      slippage,
      status: 'filled',
      timestamp: Date.now(),
    };

    account.balance -= totalCost;

    const positions = await this.getPositions();
    updatePositionInPlace(positions, symbol, 'long', quantity, executedPrice, currentPrice);
    await savePositionsToRedis(this.redis, positions);
    await saveTradeToRedis(this.redis, trade);
    await saveAccountToRedis(this.redis, account);

    logger.info(`[DryRun] BUY ${quantity} ${symbol} @ $${executedPrice.toFixed(2)}`);

    return { success: true, trade, account };
  }

  /**
   * Execute simulated sell order
   */
  async sell(symbol: string, quantity: number, currentPrice: number): Promise<ExecutionResult> {
    const positions = await this.getPositions();
    const position = positions.find(p => p.symbol === symbol);

    if (!position || position.quantity < quantity) {
      return {
        success: false,
        message: `Insufficient position: have ${position?.quantity || 0} ${symbol}`,
      };
    }

    if (Math.random() > this.config.simulateFillRate) {
      return { success: false, message: 'Order not filled (simulated market conditions)' };
    }

    const slippage = currentPrice * this.config.slippagePercent;
    const executedPrice = currentPrice - slippage;
    const fee = quantity * executedPrice * this.config.feePercent;
    const totalRevenue = (quantity * executedPrice) - fee;
    const pnl = (executedPrice - position.entryPrice) * quantity - fee;

    const trade: PaperTrade = {
      id: `paper-sell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      side: 'sell',
      quantity,
      requestedPrice: currentPrice,
      executedPrice,
      fee,
      slippage,
      status: 'filled',
      timestamp: Date.now(),
      pnl,
    };

    let account = await this.getAccount();
    account.balance += totalRevenue;
    account.realizedPnl += pnl;
    account.totalTrades++;
    if (pnl > 0) account.winningTrades++;
    else account.losingTrades++;

    reducePositionInPlace(positions, symbol, quantity, currentPrice);
    await savePositionsToRedis(this.redis, positions);
    await saveTradeToRedis(this.redis, trade);
    await saveAccountToRedis(this.redis, account);

    logger.info(`[DryRun] SELL ${quantity} ${symbol} @ $${executedPrice.toFixed(2)} | P&L: $${pnl.toFixed(2)}`);

    return { success: true, trade, account };
  }

  /**
   * Get all open positions
   */
  async getPositions(): Promise<PaperPosition[]> {
    return loadPositionsFromRedis(this.redis);
  }

  /**
   * Get specific position
   */
  async getPosition(symbol: string): Promise<PaperPosition | null> {
    const positions = await this.getPositions();
    return positions.find(p => p.symbol === symbol) || null;
  }

  /**
   * Get trade history
   */
  async getTradeHistory(limit: number = 50): Promise<PaperTrade[]> {
    const data = await this.redis.lrange(DRY_RUN_KEYS.TRADES, 0, limit - 1);
    return data.map(t => JSON.parse(t) as PaperTrade);
  }

  /**
   * Get performance metrics
   */
  async getPerformance(): Promise<{
    totalReturn: number;
    totalReturnPercent: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
  }> {
    const account = await this.getAccount();
    const trades = await this.getTradeHistory(1000);
    return computePerformance(account, this.config.initialBalance, trades);
  }

  /**
   * Update prices for all positions (call periodically)
   */
  async updatePrices(prices: Map<string, number>): Promise<PaperPosition[]> {
    const positions = await this.getPositions();
    updatePositionsPrices(positions, prices);
    await savePositionsToRedis(this.redis, positions);
    return positions;
  }

  /**
   * Reset paper trading account
   */
  async reset(): Promise<PaperAccount> {
    return this.initialize();
  }
}
