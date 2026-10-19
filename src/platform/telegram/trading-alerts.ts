/**
 * Telegram Trading Alerts
 * Sends paper P&L summaries, individual trade notifications, and whale alerts
 * to a configured Telegram chat via the Bot API (plain HTTPS fetch — no libraries).
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN — bot token from @BotFather
 *   TELEGRAM_CHAT_ID   — target chat/channel/group ID
 */

import { logger } from '../../shared/utils/logger';
import type { PaperTrade, PaperPortfolio } from '../../desk/wiring/paper-trading-orchestrator';
import type { WhaleActivity } from '../../desk/feeds/whale-activity-feed';
import {
  truncate,
  sign,
  formatTradeAlert,
  formatPnlSummary,
  formatWhaleAlert,
} from './trading-alert-formatters';

export * from './trading-alert-formatters';

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? '';
}

function getChatId(): string {
  return process.env.TELEGRAM_CHAT_ID ?? '';
}

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Send a text message to the configured Telegram chat.
 */
async function sendMessage(text: string): Promise<boolean> {
  const token = getBotToken();
  const chatId = getChatId();

  if (!token || !chatId) {
    logger.warn('[TradingAlerts] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert');
    return false;
  }

  try {
    const resp = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_notification: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.warn('[TradingAlerts] Telegram API error', { status: resp.status, body });
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[TradingAlerts] Network error sending Telegram message', { err: (err as Error).message });
    return false;
  }
}

/**
 * Alert when a paper trade is opened.
 */
export async function sendTradeAlert(trade: PaperTrade): Promise<boolean> {
  const text = formatTradeAlert(trade);
  logger.info('[TradingAlerts] Sending trade alert', { tradeId: trade.id, side: trade.side });
  return sendMessage(text);
}

/**
 * Periodic P&L summary pushed to Telegram.
 */
export async function sendPnlSummary(portfolio: PaperPortfolio): Promise<boolean> {
  const text = formatPnlSummary(portfolio);
  logger.info('[TradingAlerts] Sending P&L summary', {
    totalPnl: portfolio.totalPnl,
    openPositions: portfolio.positions.length,
  });
  return sendMessage(text);
}

/**
 * Alert on large whale trades detected by the whale-activity feed.
 */
export async function sendWhaleAlert(whale: WhaleActivity): Promise<boolean> {
  const text = formatWhaleAlert(whale);
  logger.info('[TradingAlerts] Sending whale alert', {
    marketId: whale.marketId,
    size: whale.size,
    side: whale.side,
  });
  return sendMessage(text);
}

let periodicTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a periodic P&L report on the given interval.
 */
export function startPeriodicPnlReport(
  getPortfolio: () => PaperPortfolio,
  intervalMs = 60 * 60 * 1000,
): void {
  if (periodicTimer) {
    logger.warn('[TradingAlerts] Periodic report already running — skipping duplicate start');
    return;
  }

  logger.info('[TradingAlerts] Starting periodic P&L report', { intervalMs });
  periodicTimer = setInterval(async () => {
    try {
      await sendPnlSummary(getPortfolio());
    } catch (err) {
      logger.warn('[TradingAlerts] Periodic report error', { err: (err as Error).message });
    }
  }, intervalMs);

  if (periodicTimer.unref) periodicTimer.unref();
}

/** Cancel an active periodic P&L report. */
export function stopPeriodicPnlReport(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
    logger.info('[TradingAlerts] Periodic P&L report stopped');
  }
}
