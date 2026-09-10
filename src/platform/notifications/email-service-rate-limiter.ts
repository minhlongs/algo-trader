/**
 * Email Service Rate Limiter
 * Redis-backed rate limiting with in-memory fallback.
 */

import { getRedisClient } from '../../redis';
import { logger } from '../../shared/utils/logger';

export async function applyEmailRateLimit(
  redisKeyPrefix: string,
  rateLimitDelay: number
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${redisKeyPrefix}global`;
    const now = Date.now();

    const current = await redis.get(key);
    if (current) {
      const parsed = JSON.parse(current);
      const elapsed = now - parsed.timestamp;

      if (elapsed < rateLimitDelay) {
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay - elapsed));
      }
    }

    await redis.setex(key, 60, JSON.stringify({ timestamp: now }));
  } catch (error) {
    logger.warn('[EmailService] Redis rate limiting failed, using fallback:', { error });
    await applyEmailRateLimitFallback(redisKeyPrefix, rateLimitDelay);
  }
}

async function applyEmailRateLimitFallback(
  redisKeyPrefix: string,
  rateLimitDelay: number
): Promise<void> {
  const now = Date.now();
  const lastSendTime = parseInt(await getRedisClient().get(`${redisKeyPrefix}last_send`) || '0');
  const timeSinceLastSend = now - lastSendTime;

  if (timeSinceLastSend < rateLimitDelay) {
    await new Promise(resolve => setTimeout(resolve, rateLimitDelay - timeSinceLastSend));
  }

  await getRedisClient().setex(`${redisKeyPrefix}last_send`, 3600, now.toString());
}
