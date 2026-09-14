import type { RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type { DrawdownAlert } from '@desk/risk';

export async function persistDrawdownAlert(
  redis: RedisClientType,
  userId: string,
  alert: DrawdownAlert,
): Promise<void> {
  try {
    const key = `risk:alerts:${userId}`;
    const record = {
      ...alert,
      userId,
      persistedAt: Date.now(),
    };
    await redis.lpush(key, JSON.stringify(record));
    await redis.ltrim(key, 0, 199); // keep last 200
    await redis.expire(key, 86400 * 30); // 30 days
  } catch (err) {
    logger.warn('[DrawdownMonitorService] Persist alert failed', { error: String(err) });
  }
}

export async function getTelegramChatId(
  redis: RedisClientType,
  userId: string,
): Promise<string | null> {
  try {
    const val = await redis.get(`telegram:chat:${userId}`);
    return val ?? null;
  } catch {
    return null;
  }
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export async function dispatchTelegramDrawdownAlerts(
  redis: RedisClientType,
  userId: string,
  alerts: DrawdownAlert[],
): Promise<void> {
  try {
    const chatId = await getTelegramChatId(redis, userId);
    if (!chatId) return;

    for (const alert of alerts) {
      const text = [
        '⚠️ *Drawdown Alert*',
        '',
        alert.message,
        `Threshold: ${(alert.threshold * 100).toFixed(2)}%`,
        `Current: ${(alert.current * 100).toFixed(2)}%`,
        `Time: ${new Date(alert.triggeredAt).toISOString()}`,
      ].join('\n');

      await sendTelegramMessage(chatId, text);
    }
  } catch {
    // swallow — Telegram is non-critical
  }
}
