/**
 * Dry-Run Order Simulator
 *
 * Pure buy/sell simulation logic: slippage, fee modeling,
 * trade object construction, and Redis persistence sequencing.
 * Used exclusively by DryRunExecutor.
 */

import { logger } from '../../shared/utils/logger';
import type { RedisClientType } from '../../redis';
import {
  type DryRunConfig,
  type PaperPosition,
  type PaperTrade,
  type PaperAccount,
  type ExecutionResult,
  updatePositionInPlace,
  reducePositionInPlace,
  savePositionsToRedis,
  saveTradeToRedis,
  saveAccountToRedis,
} from './dry-run-position-tracker';

export async function executeDryRunBuy(
  redis: RedisClientType,
  config: DryRunConfig,
  account: PaperAccount,
  positions: PaperPosition[],
  symbol: string,
  quantity: number,
  currentPrice: number,
): Promise<ExecutionResult> {
  const requiredBalance = quantity * currentPrice;

  if (requiredBalance > account.balance) {
    return {
      success: false,
      message: `Insufficient balance: need $${requiredBalance.toFixed(2)}, have $${account.balance.toFixed(2)}`,
    };
  }

  if (Math.random() > config.simulateFillRate) {
    return { success: false, message: 'Order not filled (simulated market conditions)' };
  }

  const slippage = currentPrice * config.slippagePercent;
  const executedPrice = currentPrice + slippage;
  const fee = quantity * executedPrice * config.feePercent;
  const totalCost = quantity * executedPrice + fee;

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
  updatePositionInPlace(positions, symbol, 'long', quantity, executedPrice, currentPrice);

  await savePositionsToRedis(redis, positions);
  await saveTradeToRedis(redis, trade);
  await saveAccountToRedis(redis, account);

  logger.info(`[DryRun] BUY ${quantity} ${symbol} @ $${executedPrice.toFixed(2)}`);
  return { success: true, trade, account };
}

export async function executeDryRunSell(
  redis: RedisClientType,
  config: DryRunConfig,
  positions: PaperPosition[],
  getAccount: () => Promise<PaperAccount>,
  symbol: string,
  quantity: number,
  currentPrice: number,
): Promise<ExecutionResult> {
  const position = positions.find((p) => p.symbol === symbol);

  if (!position || position.quantity < quantity) {
    return {
      success: false,
      message: `Insufficient position: have ${position?.quantity || 0} ${symbol}`,
    };
  }

  if (Math.random() > config.simulateFillRate) {
    return { success: false, message: 'Order not filled (simulated market conditions)' };
  }

  const slippage = currentPrice * config.slippagePercent;
  const executedPrice = currentPrice - slippage;
  const fee = quantity * executedPrice * config.feePercent;
  const totalRevenue = quantity * executedPrice - fee;
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

  const account = await getAccount();
  account.balance += totalRevenue;
  account.realizedPnl += pnl;
  account.totalTrades++;
  if (pnl > 0) account.winningTrades++;
  else account.losingTrades++;

  reducePositionInPlace(positions, symbol, quantity, currentPrice);
  await savePositionsToRedis(redis, positions);
  await saveTradeToRedis(redis, trade);
  await saveAccountToRedis(redis, account);

  logger.info(`[DryRun] SELL ${quantity} ${symbol} @ $${executedPrice.toFixed(2)} | P&L: $${pnl.toFixed(2)}`);
  return { success: true, trade, account };
}
