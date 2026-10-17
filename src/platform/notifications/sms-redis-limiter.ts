import { getRedisClient } from '../../redis';
import { logger } from '../../shared/utils/logger';

export async function checkSmsDailyLimitRedis(
  redisKeyPrefix: string,
  recipient: string,
  dailyLimit: number
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const key = `${redisKeyPrefix}daily:${recipient}`;
    const count = await redis.get(key);
    return !count || parseInt(count, 10) < dailyLimit;
  } catch (error) {
    logger.warn('[SmsService] Redis daily limit check failed:', { error });
    return true;
  }
}

export async function incrementSmsDailyCountRedis(
  redisKeyPrefix: string,
  recipient: string
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${redisKeyPrefix}daily:${recipient}`;
    await redis.incr(key);
    await redis.expire(key, 86400);
  } catch (error) {
    logger.warn('[SmsService] Redis daily count increment failed:', { error });
  }
}

export async function applySmsRateLimitRedis(
  redisKeyPrefix: string,
  rateLimitDelay: number
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${redisKeyPrefix}last_send`;
    const lastSend = await redis.get(key);

    if (lastSend) {
      const elapsed = Date.now() - parseInt(lastSend, 10);
      if (elapsed < rateLimitDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, rateLimitDelay - elapsed)
        );
      }
    }

    await redis.setex(key, 3600, Date.now().toString());
  } catch (error) {
    logger.warn('[SmsService] Redis rate limiting failed:', { error });
  }
}
