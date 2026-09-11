/**
 * Telegram Bot Command Registration
 * Registers all user commands and catch-all text handling on the Grammy bot instance.
 */
import type { Bot, Context } from 'grammy';
import {
  handleStart,
  handleHelp,
  handleStatus,
  handleLink,
  handleUnlink,
  handleNotifications,
  handleLimits,
  handleBalance,
  handlePositions,
  handlePnl,
  handleCampaign,
  handleResults,
} from './bot-command-handlers';
import {
  handleFaq,
  handleFaqDetail,
  handleSupport,
  handlePricing,
  handleUnknownMessage,
} from './auto-support-handlers';
import { handleAsk } from './ask-handler';
import { handleLeaderboard } from './leaderboard-handler';

export function registerBotCommands(bot: Bot<Context>): void {
  bot.command('start', (ctx: Context) => handleStart(ctx));
  bot.command('help', (ctx: Context) => handleHelp(ctx));
  bot.command('status', (ctx: Context) => handleStatus(ctx));
  bot.command('link', async (ctx: Context) => handleLink(ctx));
  bot.command('unlink', async (ctx: Context) => handleUnlink(ctx));
  bot.command('notifications', async (ctx: Context) => handleNotifications(ctx));
  bot.command('limits', (ctx: Context) => handleLimits(ctx));
  bot.command('balance', async (ctx: Context) => handleBalance(ctx));
  bot.command('positions', async (ctx: Context) => handlePositions(ctx));
  bot.command('pnl', async (ctx: Context) => handlePnl(ctx));
  bot.command('campaign', (ctx: Context) => handleCampaign(ctx));
  bot.command('results', async (ctx: Context) => handleResults(ctx));
  bot.command('faq', (ctx: Context) => {
    const text = (ctx.message as { text?: string })?.text || '';
    return text.trim() === '/faq' ? handleFaq(ctx) : handleFaqDetail(ctx);
  });
  bot.command('support', (ctx: Context) => handleSupport(ctx));
  bot.command('pricing', (ctx: Context) => handlePricing(ctx));
  bot.command('leaderboard', (ctx: Context) => handleLeaderboard(ctx));
  bot.command('ask', async (ctx: Context) => {
    const text = (ctx.message as { text?: string })?.text || '';
    const query = text.replace(/^\/ask(\s|@\w+)*/, '').trim();
    if (!query) {
      await ctx.reply(
        '🤖 *AI Co-pilot*\n\nAsk me anything about your trading:\n\n' +
        '• `/ask what is my risk exposure?`\n' +
        '• `/ask find arbitrage opportunities`\n' +
        '• `/ask how are my strategies performing?`\n' +
        '• `/ask what is the market doing?`\n' +
        '• `/ask generate a weekly report`\n\n' +
        'Example: `/ask what is my risk exposure?`',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    await handleAsk(ctx, query);
  });

  // Catch-all: auto-match unknown text messages to FAQ
  bot.on('message:text', (ctx: Context) => handleUnknownMessage(ctx));
}
