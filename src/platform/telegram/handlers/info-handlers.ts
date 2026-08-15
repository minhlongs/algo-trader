/**
 * Info command handlers — /start, /help, /status, /limits
 */

import type { Context } from 'grammy';
import { userSessionRepo } from '../user-session-repository-d1';

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
