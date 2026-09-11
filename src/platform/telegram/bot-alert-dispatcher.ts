/**
 * Telegram Bot Alert Dispatcher
 * Dispatches threshold alerts to chats and users with Redis-backed rate limiting.
 */
import type { Bot, Context } from 'grammy';
import { getRedisClient } from '../../redis';
import { logger } from '../../shared/utils/logger';
import { formatTelegramMessage } from '../notifications/alert-formatter';
import { userSessionRepo } from './user-session-repository-d1';

/**
 * Redis-backed rate limiting for crash resilience
 */
export async function applyTelegramRateLimit(
  chatId: number,
  redisKeyPrefix: string,
  rateLimitDelay: number,
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${redisKeyPrefix}${chatId}`;
    const lastSend = await redis.get(key);

    if (lastSend) {
      const elapsed = Date.now() - parseInt(lastSend, 10);
      if (elapsed < rateLimitDelay) {
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay - elapsed));
      }
    }

    await redis.setex(key, 3600, Date.now().toString());
  } catch (error) {
    logger.warn('[TelegramBot] Redis rate limiting failed:', { error });
  }
}

export async function sendTelegramThresholdAlert(
  bot: Bot<Context> | null,
  initialized: boolean,
  chatId: number,
  licenseKey: string,
  threshold: number,
  currentUsage: number,
  dailyLimit: number,
  percentUsed: number,
  rateLimitFn: (chatId: number) => Promise<void>,
): Promise<boolean> {
  if (!initialized || !bot) {
    logger.warn('[TelegramBot] Not initialized, skipping message');
    return false;
  }

  await rateLimitFn(chatId);

  const session = await userSessionRepo.getByUserId(chatId);
  if (session && !session.notificationsEnabled) {
    logger.info(`[TelegramBot] Notifications disabled for user ${chatId}`);
    return false;
  }

  const message = formatTelegramMessage({
    licenseKey,
    threshold,
    currentUsage,
    dailyLimit,
    percentUsed,
  });

  try {
    await bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    logger.info(`[TelegramBot] Alert sent to chat ${chatId}`);
    return true;
  } catch (error) {
    logger.error('[TelegramBot] Send failed:', { error });
    return false;
  }
}

export async function sendTelegramToAllLinkedUsers(
  sendAlertFn: (
    userId: number,
    licenseKey: string,
    threshold: number,
    currentUsage: number,
    dailyLimit: number,
    percentUsed: number,
  ) => Promise<boolean>,
  licenseKey: string,
  threshold: number,
  currentUsage: number,
  dailyLimit: number,
  percentUsed: number,
): Promise<number> {
  let sentCount = 0;

  const allSessions = await userSessionRepo.getAll();
  for (const session of allSessions) {
    if (session.licenseKeys.includes(licenseKey) && session.notificationsEnabled) {
      const success = await sendAlertFn(
        session.userId,
        licenseKey,
        threshold,
        currentUsage,
        dailyLimit,
        percentUsed,
      );
      if (success) sentCount++;
    }
  }

  return sentCount;
}
