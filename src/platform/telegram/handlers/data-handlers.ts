/**
 * Data query handlers — /balance, /positions, /pnl, /results
 */

import type { Context } from 'grammy';
import { getRedisClient } from '../../../redis';
import { userSessionRepo } from '../user-session-repository-d1';
import { aggregateRedisPnlForKeys } from './data-handlers-helpers';

const NO_KEYS_MSG = 'No license keys linked. Use /link <your-key> to get started.';

export async function handleBalance(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply(NO_KEYS_MSG);
    return;
  }

  const redis = getRedisClient();
  const balanceData = await redis.hgetall(`balance:${session.licenseKeys[0]}`);
  const balance = parseFloat(balanceData.balance || '0');
  const equity = parseFloat(balanceData.equity || balanceData.balance || '0');

  const balanceMessage = [
    '💰 *Account Balance*',
    '',
    `*Available:* $${balance.toFixed(2)}`,
    `*Equity:* $${equity.toFixed(2)}`,
    '',
    `*Linked Keys:* ${session.licenseKeys.length}`,
  ].join('\n');

  await ctx.reply(balanceMessage, { parse_mode: 'Markdown' });
}

interface Position {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export async function handlePositions(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply(NO_KEYS_MSG);
    return;
  }

  const redis = getRedisClient();
  const positionsData = await redis.get(`positions:${session.licenseKeys[0]}`);
  const positions: Position[] = positionsData ? JSON.parse(positionsData) : [];

  if (positions.length === 0) {
    await ctx.reply('📭 No open positions');
    return;
  }

  const formattedPositions = positions
    .map((p) =>
      [
        `*${p.symbol}*`,
        `Side: ${p.side.toUpperCase()}`,
        `Qty: ${p.quantity}`,
        `Entry: $${p.entryPrice.toFixed(2)}`,
        `Current: $${p.currentPrice.toFixed(2)}`,
        `P&L: $${p.unrealizedPnl.toFixed(2)}`,
      ].join('\n')
    )
    .join('\n\n');

  await ctx.reply(`📊 *Open Positions*\n\n${formattedPositions}`, {
    parse_mode: 'Markdown',
  });
}

export async function handlePnl(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply(NO_KEYS_MSG);
    return;
  }

  const stats = await aggregateRedisPnlForKeys(session.licenseKeys);
  const msg = [
    '📈 *P&L Statistics*',
    '',
    `*Realized P&L:* $${stats.totalRealized.toFixed(2)}`,
    `*Unrealized P&L:* $${stats.totalUnrealized.toFixed(2)}`,
    `*Total P&L:* $${stats.totalPnl.toFixed(2)}`,
    '',
    `*Trades:* ${stats.totalTrades}`,
    `*Wins:* ${stats.totalWins}`,
    `*Losses:* ${stats.losses}`,
    `*Win Rate:* ${stats.winRate}%`,
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

export async function handleResults(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply(NO_KEYS_MSG);
    return;
  }

  const stats = await aggregateRedisPnlForKeys(session.licenseKeys);
  const msg = [
    '📈 *Subscription Results (Aggregated)*',
    '',
    `*Across:* ${session.licenseKeys.length} linked key(s)`,
    '',
    `*Realized P&L:* $${stats.totalRealized.toFixed(2)}`,
    `*Unrealized P&L:* $${stats.totalUnrealized.toFixed(2)}`,
    `*Total P&L:* $${stats.totalPnl.toFixed(2)}`,
    '',
    `*Trades:* ${stats.totalTrades}`,
    `*Wins:* ${stats.totalWins}`,
    `*Losses:* ${stats.losses}`,
    `*Win Rate:* ${stats.winRate}%`,
  ].join('\n');

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}
