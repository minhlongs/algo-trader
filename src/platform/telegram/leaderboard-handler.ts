/**
 * /leaderboard command handler for Telegram bot.
 * Fetches top strategies from the leaderboard API and formats them for Telegram.
 */

import type { Context } from 'grammy';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || DEFAULT_API_BASE_URL;
}

function getApiKey(): string {
  return process.env.TELEGRAM_COPILOT_API_KEY || '';
}

interface LeaderboardStrategy {
  name: string;
  winRate: number;
  sharpe: number;
}

interface LeaderboardResponse {
  strategies: LeaderboardStrategy[];
}

/**
 * Format a leaderboard entry for Telegram markdown.
 */
function formatEntry(index: number, strategy: LeaderboardStrategy): string {
  const winRatePct = (strategy.winRate * 100).toFixed(0);
  return `${index + 1}. ${strategy.name} \\- ${winRatePct}% win rate \\| Sharpe ${strategy.sharpe.toFixed(2)}`;
}

/**
 * Handle the /leaderboard command.
 * Calls GET /api/v1/leaderboard?sort=winRate&limit=5 with Bearer token auth
 * and formats the response as Telegram markdown.
 */
export async function handleLeaderboard(ctx: Context): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    await ctx.reply(
      '⚠️ Leaderboard is not available right now\\. Please try again later\\.',
      { parse_mode: 'MarkdownV2' },
    );
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/v1/leaderboard?sort=winRate&limit=5`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 429) {
        await ctx.reply(
          '⏳ Too many requests\\. Please wait a moment and try again\\.',
          { parse_mode: 'MarkdownV2' },
        );
      } else if (response.status === 403) {
        await ctx.reply(
          '🔒 The leaderboard requires a PRO tier subscription\\. Upgrade at quant\\.cashclaw\\.cc',
          { parse_mode: 'MarkdownV2' },
        );
      } else {
        await ctx.reply(
          'Sorry, I could not fetch the leaderboard\\. Please try again later\\.',
        );
      }
      return;
    }

    const data: LeaderboardResponse = await response.json();

    if (!data.strategies || data.strategies.length === 0) {
      await ctx.reply(
        '📊 No strategies found on the leaderboard yet\\.',
        { parse_mode: 'MarkdownV2' },
      );
      return;
    }

    const formatted = data.strategies
      .map((s, i) => formatEntry(i, s))
      .join('\n');

    const message = `🏆 *Top Strategies*\n\n${formatted}`;

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      await ctx.reply(
        'Request timed out\\. The leaderboard is taking too long to load\\.',
      );
    } else {
      await ctx.reply(
        'An error occurred while fetching the leaderboard\\. Please try again later\\.',
      );
    }
  }
}
