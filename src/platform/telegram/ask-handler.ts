/**
 * Co-pilot /ask command handler for Telegram bot.
 * Sends query to the backend API and formats the response for Telegram.
 */

import type { Context } from 'grammy';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || DEFAULT_API_BASE_URL;
}

function getApiKey(): string {
  return process.env.TELEGRAM_COPILOT_API_KEY || '';
}

interface CopilotResponse {
  answer: string;
  actions?: Array<{ label: string; action: string; payload?: unknown }>;
  sourceData?: unknown;
}

/**
 * Format a co-pilot API response for Telegram markdown.
 * Strips emoji-safe markdown and truncates long responses.
 */
function formatTelegramResponse(data: CopilotResponse): string {
  const maxLength = 4000;
  let answer = data.answer;

  // Truncate if too long for Telegram
  if (answer.length > maxLength) {
    answer = answer.substring(0, maxLength - 3) + '...';
  }

  return answer;
}

/**
 * Handle the /ask command.
 * Calls POST /api/v1/co-pilot/ask with Bearer token auth
 * and formats the response as Telegram markdown.
 */
export async function handleAsk(ctx: Context, query: string): Promise<void> {
  // Show typing indicator
  try {
    await ctx.replyWithChatAction('typing');
  } catch {
    // Non-critical — continue even if typing indicator fails
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    await ctx.reply(
      '⚠️ The AI Co-pilot is not configured yet. Please contact support.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  const url = `${apiBaseUrl}/api/v1/co-pilot/ask`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        context: { source: 'telegram' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 429) {
        await ctx.reply(
          '⏳ You have exceeded the rate limit. Please wait a moment and try again.',
          { parse_mode: 'Markdown' },
        );
      } else if (response.status === 403) {
        await ctx.reply(
          '🔒 This feature requires a PRO tier subscription. Upgrade at quant.cashclaw.cc',
          { parse_mode: 'Markdown' },
        );
      } else {
        await ctx.reply(
          'Sorry, I could not process your request. Please try again later.',
        );
      }
      return;
    }

    const data: CopilotResponse = await response.json();
    const formatted = formatTelegramResponse(data);

    await ctx.reply(formatted, { parse_mode: 'Markdown' });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      await ctx.reply(
        'Request timed out. The AI Co-pilot is taking too long — please try a simpler question.',
      );
    } else {
      await ctx.reply(
        'An error occurred while contacting the AI Co-pilot. Please try again later.',
      );
    }
  }
}
