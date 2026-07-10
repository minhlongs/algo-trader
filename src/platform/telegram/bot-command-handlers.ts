/**
 * Telegram Bot Command Handlers
 * Individual command handler methods extracted from TelegramBotService.
 * Each handler corresponds to a bot slash command.
 *
 * NOTE: user sessions are persisted in D1 via userSessionRepo (not in-memory Map).
 * grammy passes only (ctx) to command handlers — no Map argument.
 */

import type { Context } from 'grammy';
import { getRedisClient } from '../../redis';
import { formatTelegramMessage, getTelegramActionMessage, generateTelegramProgressBar, getShortKey } from '../notifications/alert-formatter';
import type { UserSession } from './bot';
import { MarketplaceService } from '../../platform/marketplace/services/marketplace.service';
import { userSessionRepo } from './user-session-repository-d1';

// Re-export types used by handlers for convenience
export type { UserSession };

// -- /start ---------------------------------------------------------------

export async function handleStart(ctx: Context): Promise<void> {
  const welcomeMessage = `
🤖 Welcome to Algo Trader Bot!

I'll send you instant alerts when your API usage reaches critical thresholds.

*Available Commands:*
/ask - Ask AI Co-pilot a trading question
/help - Show this help message
/status - Check your current usage
/campaign - Browse marketplace strategies
/results - View subscription P&L
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
/ask - Ask AI Co-pilot a question
/help - Show this help
/status - Current usage stats
/campaign - Browse marketplace strategies
/campaign <id> — Strategy details
/results - View subscription P&L
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

export async function handleStatus(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const session = await userSessionRepo.getByUserId(userId);
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

// -- /link -----------------------------------------------------------------

export async function handleLink(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = (ctx.message as { text?: string })?.text?.split(' ');
  if (!args || args.length < 2) {
    await ctx.reply('Usage: /link <your-license-key>');
    return;
  }

  const licenseKey = args[1];
  let session = await userSessionRepo.getByUserId(userId);

  if (!session) {
    await userSessionRepo.upsert({
      userId,
      licenseKeys: [licenseKey],
      notificationsEnabled: true,
      lastCommand: 'link',
    });
    await ctx.reply(
      `✅ License key \`${licenseKey}\` linked successfully!\n\nYou'll now receive alerts for this key.`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  if (session.licenseKeys.includes(licenseKey)) {
    await ctx.reply(`Key \`${licenseKey}\` is already linked.`, { parse_mode: 'Markdown' });
    return;
  }

  session.licenseKeys.push(licenseKey);
  await userSessionRepo.upsert({
    userId,
    licenseKeys: session.licenseKeys,
    notificationsEnabled: session.notificationsEnabled,
    lastCommand: 'link',
  });

  await ctx.reply(
    `✅ License key \`${licenseKey}\` linked successfully!\n\nYou'll now receive alerts for this key.`,
    { parse_mode: 'Markdown' },
  );
}

// -- /unlink ---------------------------------------------------------------

export async function handleUnlink(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const args = (ctx.message as { text?: string })?.text?.split(' ');
  if (!args || args.length < 2) {
    await ctx.reply('Usage: /unlink <your-license-key>');
    return;
  }

  const licenseKey = args[1];
  const session = await userSessionRepo.getByUserId(userId);

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
  await userSessionRepo.upsert({
    userId,
    licenseKeys: session.licenseKeys,
    notificationsEnabled: session.notificationsEnabled,
    lastCommand: 'unlink',
  });

  await ctx.reply(`✅ License key \`${licenseKey}\` unlinked.`);
}

// -- /notifications --------------------------------------------------------

export async function handleNotifications(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  let session = await userSessionRepo.getByUserId(userId);

  if (!session) {
    await userSessionRepo.upsert({
      userId,
      licenseKeys: [],
      notificationsEnabled: true,
      lastCommand: 'notifications',
    });
    await ctx.reply('🔔 Notifications enabled.\n\nYou will receive threshold alerts.', { parse_mode: 'Markdown' });
    return;
  }

  session.notificationsEnabled = !session.notificationsEnabled;
  await userSessionRepo.upsert({
    userId,
    licenseKeys: session.licenseKeys,
    notificationsEnabled: session.notificationsEnabled,
    lastCommand: 'notifications',
  });

  const status = session.notificationsEnabled ? 'enabled' : 'disabled';
  await ctx.reply(
    `🔔 Notifications ${status}.\n\nYou will ${session.notificationsEnabled ? '' : 'NOT '}receive threshold alerts.`,
    { parse_mode: 'Markdown' },
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

// -- /campaign -------------------------------------------------------------

export async function handleCampaign(ctx: Context): Promise<void> {
  const text = (ctx.message as { text?: string })?.text || '';
  const parts = text.split(' ');

  // /campaign <id> — strategy detail
  if (parts.length > 1) {
    const strategyId = parts[1]!;
    try {
      const service = MarketplaceService.getInstance();
      const detail = await service.getStrategyWithDetails(strategyId);
      if (!detail) {
        await ctx.reply('❌ Strategy not found.');
        return;
      }
      const s = detail.strategy;
      const price = detail.listing?.priceUsdMonthly != null
        ? `$${(detail.listing.priceUsdMonthly / 100).toFixed(2)}/month`
        : 'Free';
      const msg = `
📊 *${s.name}*

${s.description}

*Price:* ${price}
*Category:* ${s.category}
*Risk Level:* ${'🔴'.repeat(s.riskLevel) || 'N/A'}
*Tags:* ${s.tags.join(', ') || 'None'}
`.trim();
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply('❌ Could not fetch strategy details. Please try again.');
    }
    return;
  }

  // /campaign — list published strategies
  try {
    const service = MarketplaceService.getInstance();
    const result = await service.listStrategies({ status: 'approved', limit: 20 });
    if (!result.data.length) {
      await ctx.reply('📭 No strategies currently available in the marketplace.');
      return;
    }
    const lines = result.data.map((s, i) => {
      const price = 'Free'; // listing unavailable in list view
      return `${i + 1}. *${s.name}* — ${price}\n ${(s.description || '').slice(0, 120)}${s.description?.length > 120 ? '…' : ''}`;
    });
    const msg = `
📢 *Marketplace Campaigns*

${lines.join('\n\n')}

Use /campaign <id> for details.
`.trim();
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch {
    await ctx.reply('❌ Could not fetch marketplace campaigns. Please try again later.');
  }
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

// -- Alert formatting helpers (thin wrappers kept for cohesion) ------------

export { formatTelegramMessage, getTelegramActionMessage, generateTelegramProgressBar, getShortKey };
