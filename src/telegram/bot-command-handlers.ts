/**
 * Telegram Bot Command Handlers
 * Individual command handler methods extracted from TelegramBotService.
 * Each handler corresponds to a bot slash command.
 */

import type { Context } from 'grammy';
import { getRedisClient } from '../redis';
import { formatTelegramMessage, getTelegramActionMessage, generateTelegramProgressBar, getShortKey } from '../notifications/alert-formatter';
import type { UserSession } from './bot';

// Re-export types used by handlers for convenience
export type { UserSession };

// -- /start ---------------------------------------------------------------

export async function handleStart(ctx: Context): Promise<void> {
  const welcomeMessage = `
🤖 Welcome to Algo Trader Bot!

I'll send you instant alerts when your API usage reaches critical thresholds.

*Available Commands:*
/help - Show this help message
/status - Check your current usage
/link - Link a license key
/unlink - Unlink a license key
/notifications - Toggle alerts
/limits - View tier limits

Get started by linking your license key with /link <your-key>
  `.trim();

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
}

// -- /help ----------------------------------------------------------------

export async function handleHelp(ctx: Context): Promise<void> {
  const helpMessage = `
📖 *Algo Trader Bot Help*

*Commands:*
/start - Welcome message
/help - Show this help
/status - Current usage stats
/link <key> - Link license key
/unlink <key> - Unlink license key
/notifications - Toggle on/off
/limits - View tier limits

*Alert Thresholds:*
⚠️ 80% - Warning (email only)
🔴 90% - Urgent (email + SMS + Telegram)
🚨 100% - Critical (all channels)

*Support:*
Contact support for assistance.
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

// -- /status --------------------------------------------------------------

export async function handleStatus(ctx: Context, userSessions: Map<number, UserSession>): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = userSessions.get(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply('No license keys linked. Use /link <your-key> to get started.');
    return;
  }

  const statusMessage = `
📊 *Your Linked Keys:*
${session.licenseKeys.map(key => `• \`${key}\``).join('\n')}

Use /status <key> for detailed usage.
  `.trim();

  await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
}

// -- /link ----------------------------------------------------------------

export async function handleLink(ctx: Context, userSessions: Map<number, UserSession>): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = (ctx.message as { text?: string })?.text?.split(' ');
  if (!args || args.length < 2) {
    await ctx.reply('Usage: /link <your-license-key>');
    return;
  }

  const licenseKey = args[1];
  let session = userSessions.get(userId);

  if (!session) {
    session = { userId, licenseKeys: [], notificationsEnabled: true, lastCommand: 'link' };
    userSessions.set(userId, session);
  }

  if (session.licenseKeys.includes(licenseKey)) {
    await ctx.reply(`Key \`${licenseKey}\` is already linked.`, { parse_mode: 'Markdown' });
    return;
  }

  session.licenseKeys.push(licenseKey);
  session.lastCommand = 'link';

  await ctx.reply(
    `✅ License key \`${licenseKey}\` linked successfully!\n\nYou'll now receive alerts for this key.`,
    { parse_mode: 'Markdown' }
  );
}

// -- /unlink --------------------------------------------------------------

export async function handleUnlink(ctx: Context, userSessions: Map<number, UserSession>): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = (ctx.message as { text?: string })?.text?.split(' ');
  if (!args || args.length < 2) {
    await ctx.reply('Usage: /unlink <your-license-key>');
    return;
  }

  const licenseKey = args[1];
  const session = userSessions.get(userId);

  if (!session) {
    await ctx.reply('No license keys linked.');
    return;
  }

  const index = session.licenseKeys.indexOf(licenseKey);
  if (index === -1) {
    await ctx.reply(`Key \`${licenseKey}\` not found.`, { parse_mode: 'Markdown' });
    return;
  }

  session.licenseKeys.splice(index, 1);
  session.lastCommand = 'unlink';

  await ctx.reply(`✅ License key \`${licenseKey}\` unlinked.`, { parse_mode: 'Markdown' });
}

// -- /notifications -------------------------------------------------------

export async function handleNotifications(ctx: Context, userSessions: Map<number, UserSession>): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  let session = userSessions.get(userId);

  if (!session) {
    session = { userId, licenseKeys: [], notificationsEnabled: true, lastCommand: 'notifications' };
    userSessions.set(userId, session);
  }

  session.notificationsEnabled = !session.notificationsEnabled;
  session.lastCommand = 'notifications';

  const status = session.notificationsEnabled ? 'enabled' : 'disabled';
  await ctx.reply(
    `🔔 Notifications ${status}.\n\nYou will ${session.notificationsEnabled ? '' : 'NOT '}receive threshold alerts.`,
    { parse_mode: 'Markdown' }
  );
}

// -- /limits --------------------------------------------------------------

export async function handleLimits(ctx: Context): Promise<void> {
  const limitsMessage = `
📏 *API Usage Limits by Tier*

*FREE*
• 100 calls/day
• $0.00 overage

*PRO*
• 10,000 calls/day
• $0.01 per overage call

*ENTERPRISE*
• 100,000 calls/day
• $0.005 per overage call

*Alert Thresholds:*
• 80% - Warning
• 90% - Urgent
• 100% - Critical

Upgrade anytime to increase your limits.
  `.trim();

  await ctx.reply(limitsMessage, { parse_mode: 'Markdown' });
}

// -- /balance -------------------------------------------------------------

export async function handleBalance(ctx: Context, userSessions: Map<number, UserSession>): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = userSessions.get(userId);
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

export async function handlePositions(ctx: Context, userSessions: Map<number, UserSession>): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = userSessions.get(userId);
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

export async function handlePnl(ctx: Context, userSessions: Map<number, UserSession>): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = userSessions.get(userId);
  if (!session || session.licenseKeys.length === 0) {
    await ctx.reply('No license keys linked. Use /link <your-key> to get started.');
    return;
  }

  const redis = getRedisClient();
  const pnlData = await redis.hgetall(`pnl:${session.licenseKeys[0]}`);
  const realizedPnl = parseFloat(pnlData.realized || '0');
  const unrealizedPnl = parseFloat(pnlData.unrealized || '0');
  const totalTrades = parseInt(pnlData.totalTrades || '0');
  const winningTrades = parseInt(pnlData.winningTrades || '0');

  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : '0';

  const pnlMessage = `
📈 *P&L Statistics*

*Realized P&L:* $${realizedPnl.toFixed(2)}
*Unrealized P&L:* $${unrealizedPnl.toFixed(2)}
*Total:* $${(realizedPnl + unrealizedPnl).toFixed(2)}

*Trades:* ${totalTrades}
*Wins:* ${winningTrades}
*Losses:* ${totalTrades - winningTrades}
*Win Rate:* ${winRate}%
  `.trim();

  await ctx.reply(pnlMessage, { parse_mode: 'Markdown' });
}

// -- Alert formatting helpers (thin wrappers kept for cohesion) -----------

export { formatTelegramMessage, getTelegramActionMessage, generateTelegramProgressBar, getShortKey };
