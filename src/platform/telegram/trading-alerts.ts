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

// ─── Config ───────────────────────────────────────────────────────────────────

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? '';
}

function getChatId(): string {
  return process.env.TELEGRAM_CHAT_ID ?? '';
}

const TELEGRAM_API_BASE = 'https://api.telegram.org';

// ─── Core HTTP send ───────────────────────────────────────────────────────────

/**
 * Send a text message to the configured Telegram chat.
 * Uses MarkdownV2 parse mode; caller is responsible for escaping special chars.
 */
async function sendMessage(text: string): Promise<boolean> {
  const token = getBotToken();
  const chatId = getChatId();

  if (!token || !chatId) {
    logger.warn('[TradingAlerts] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert');
    return false;
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  try {
    const resp = await fetch(url, {
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Alert when a paper trade is opened.
 * Example: "🟢 OPEN: YES @0.96 on 'Will X happen?' | edge: 2.4% | size: $50"
 */
export async function sendTradeAlert(trade: PaperTrade): Promise<boolean> {
  const text = formatTradeAlert(trade);
  logger.info('[TradingAlerts] Sending trade alert', { tradeId: trade.id, side: trade.side });
  return sendMessage(text);
}

/**
 * Periodic P&L summary pushed to Telegram.
 * Example: "📊 P&L: +$2,251 | Win: 66.7% | Open: 3 | Capital: $12,500"
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
 * Example: "🐋 Whale: $5,000 YES @0.72 on market ABC123 | wallet: 0x1234…"
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

// ─── Periodic reporter ────────────────────────────────────────────────────────

let periodicTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a periodic P&L report on the given interval.
 * Calls `getPortfolio()` each tick to retrieve current state.
 * Call `stopPeriodicPnlReport()` to cancel.
 *
 * @param getPortfolio - supplier function returning current portfolio state
 * @param intervalMs - report interval in ms (default 3600000 = 1 hour)
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

  // Ensure the interval doesn't keep Node alive unnecessarily in test envs
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
