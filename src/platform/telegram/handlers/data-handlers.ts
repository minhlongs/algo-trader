/**
 * Data query handlers — /balance, /positions, /pnl, /results
 */

import type { Context } from 'grammy';
import { getRedisClient } from '../../../redis';
import { userSessionRepo } from '../user-session-repository-d1';

// -- /balance -------------------------------------------------------------

export async function handleBalance(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply('No license keys linked. Use /link <your-key> to get started.');
    return;
  }

  const redis = getRedisClient();
  const balanceData = await redis.hgetall(`balance:${session.licenseKeys[0]}`);
  const balance = parseFloat(balanceData.balance || '0');
  const equity = parseFloat(balanceData.equity || balanceData.balance || '0');

  const balanceMessage = `
💰 *Account Balance*

*Available:* $${balance.toFixed(2)}
*Equity:* $${equity.toFixed(2)}

*Linked Keys:* ${session.licenseKeys.length}
`.trim();

  await ctx.reply(balanceMessage, { parse_mode: 'Markdown' });
}

// -- /positions -----------------------------------------------------------

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
    await ctx.reply('No license keys linked. Use /link <your-key> to get started.');
    return;
  }

  const redis = getRedisClient();
  const positionsData = await redis.get(`positions:${session.licenseKeys[0]}`);
  const positions: Position[] = positionsData ? JSON.parse(positionsData) : [];

  if (positions.length === 0) {
    await ctx.reply('📭 No open positions');
    return;
  }

  const positionsMessage = `
📊 *Open Positions*

${positions.map((p) => `
*${p.symbol}*
Side: ${p.side.toUpperCase()}
Qty: ${p.quantity}
Entry: $${p.entryPrice.toFixed(2)}
Current: $${p.currentPrice.toFixed(2)}
P&L: $${p.unrealizedPnl.toFixed(2)}
`).join('\n')}
`.trim();

  await ctx.reply(positionsMessage, { parse_mode: 'Markdown' });
}

// -- /pnl -----------------------------------------------------------------

export async function handlePnl(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply('No license keys linked. Use /link <your-key> to get started.');
    return;
  }

  const redis = getRedisClient();
  let totalRealized = 0;
  let totalUnrealized = 0;
  let totalTrades = 0;
  let totalWins = 0;

  for (const key of session.licenseKeys) {
    try {
      const pnlData = await redis.hgetall(`pnl:${key}`);
      if (pnlData && pnlData.realized != null) {
        totalRealized += parseFloat(pnlData.realized as string || '0');
        totalUnrealized += parseFloat(pnlData.unrealized as string || '0');
        totalTrades += parseInt(pnlData.totalTrades as string || '0', 10);
        totalWins += parseInt(pnlData.winningTrades as string || '0', 10);
      }
    } catch {
      // Skip keys with no P&L data
    }
  }

  const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0';
  const losses = totalTrades - totalWins;
  const totalPnl = totalRealized + totalUnrealized;

  const msg = `
📈 *P&L Statistics*

*Realized P&L:* $${totalRealized.toFixed(2)}
*Unrealized P&L:* $${totalUnrealized.toFixed(2)}
*Total P&L:* $${totalPnl.toFixed(2)}

*Trades:* ${totalTrades}
*Wins:* ${totalWins}
*Losses:* ${losses}
*Win Rate:* ${winRate}%
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// -- /results --------------------------------------------------------------

export async function handleResults(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply('No license keys linked. Use /link <your-key> to get started.');
    return;
  }

  const redis = getRedisClient();
  let totalRealized = 0;
  let totalUnrealized = 0;
  let totalTrades = 0;
  let totalWins = 0;

  for (const key of session.licenseKeys) {
    try {
      const pnlData = await redis.hgetall(`pnl:${key}`);
      if (pnlData && pnlData.realized != null) {
        totalRealized += parseFloat(pnlData.realized as string || '0');
        totalUnrealized += parseFloat(pnlData.unrealized as string || '0');
        totalTrades += parseInt(pnlData.totalTrades as string || '0', 10);
        totalWins += parseInt(pnlData.winningTrades as string || '0', 10);
      }
    } catch {
      // Skip keys with no P&L data
    }
  }

  const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0';
  const losses = totalTrades - totalWins;
  const totalPnl = totalRealized + totalUnrealized;

  const msg = `
📈 *Subscription Results (Aggregated)*

*Across:* ${session.licenseKeys.length} linked key(s)

*Realized P&L:* $${totalRealized.toFixed(2)}
*Unrealized P&L:* $${totalUnrealized.toFixed(2)}
*Total P&L:* $${totalPnl.toFixed(2)}

*Trades:* ${totalTrades}
*Wins:* ${totalWins}
*Losses:* ${losses}
*Win Rate:* ${winRate}%
`.trim();

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}
