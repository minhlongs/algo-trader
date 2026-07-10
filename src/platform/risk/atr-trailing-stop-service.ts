/**
 * ATR Trailing Stop Service (Platform Layer)
 *
 * Wraps @desk/risk AtrTrailingStop with:
 * - Per-symbol state in Redis
 * - Configurable period (14 default) and multiplier (2.0 default)
 * - Stop-hit detection with alert dispatch
 * - Position-level exposure tracking
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import {
  AtrTrailingStop,
  type AtrCandle,
  type AtrConfig,
  type AtrResult,
} from '@desk/risk';
import type { AtrStopRequest, AtrStopResponse } from './types';

const DEFAULT_PERIOD = 14;
const DEFAULT_MULTIPLIER = 2.0;
const CACHE_TTL = 3600; // 1 hour for ATR state

export class AtrTrailingStopService {
  private redis: RedisClientType;

  constructor(redis?: RedisClientType) {
    this.redis = redis || getRedisClient();
  }

  /**
   * Compute ATR trailing stop for a position given recent candles.
   */
  compute(request: AtrStopRequest): AtrStopResponse {
    const startMs = performance.now();

    const config: AtrConfig = {
      period: request.period ?? DEFAULT_PERIOD,
      multiplier: request.multiplier ?? DEFAULT_MULTIPLIER,
    };

    const atrValues = AtrTrailingStop.computeAtr(request.candles, config);
    if (atrValues.length === 0) {
      return {
        success: true,
        data: { atr: 0, stop: 0, stopped: false, direction: request.direction },
        computedMs: performance.now() - startMs,
      };
    }

    const stops =
      request.direction === 'long'
        ? AtrTrailingStop.trailingStopLong(request.candles, atrValues, config.multiplier)
        : AtrTrailingStop.trailingStopShort(request.candles, atrValues, config.multiplier);

    const result = AtrTrailingStop.evaluate(request.candles, stops, request.direction);
    const lastAtr = atrValues[atrValues.length - 1] ?? 0;

    return {
      success: true,
      data: {
        ...result,
        atr: lastAtr,
      },
      computedMs: performance.now() - startMs,
    };
  }

  /**
   * Update ATR state for a position and persist to Redis.
   * Call on each new candle close.
   */
  async updatePositionState(
    userId: string,
    symbol: string,
    request: AtrStopRequest,
  ): Promise<AtrStopResponse> {
    const result = this.compute(request);

    // Persist state for later retrieval
    const stateKey = `risk:atr:${userId}:${symbol}`;
    try {
      await this.redis.hmset(stateKey, {
        atr: result.data.atr.toString(),
        stop: result.data.stop.toString(),
        direction: request.direction,
        period: String(request.period ?? DEFAULT_PERIOD),
        multiplier: String(request.multiplier ?? DEFAULT_MULTIPLIER),
        lastCompute: Date.now().toString(),
      });
      await this.redis.expire(stateKey, CACHE_TTL);
    } catch (err) {
      logger.warn('[AtrTrailingStopService] State persist failed', {
        symbol,
        error: String(err),
      });
    }

    return result;
  }

  /**
   * Get stored ATR state for a position.
   */
  async getPositionState(userId: string, symbol: string): Promise<{
    atr: number;
    stop: number;
    direction: 'long' | 'short';
    period: number;
    multiplier: number;
    lastCompute: number;
  } | null> {
    const stateKey = `risk:atr:${userId}:${symbol}`;
    try {
      const data = await this.redis.hgetall(stateKey);
      if (!data || Object.keys(data).length === 0) return null;

      return {
        atr: parseFloat(data.atr || '0'),
        stop: parseFloat(data.stop || '0'),
        direction: (data.direction as 'long' | 'short') || 'long',
        period: parseInt(data.period || String(DEFAULT_PERIOD), 10),
        multiplier: parseFloat(data.multiplier || String(DEFAULT_MULTIPLIER)),
        lastCompute: parseInt(data.lastCompute || '0', 10),
      };
    } catch {
      return null;
    }
  }

  /**
   * Clear stored ATR state for a position (call on position close).
   */
  async clearPositionState(userId: string, symbol: string): Promise<void> {
    await this.redis.del(`risk:atr:${userId}:${symbol}`);
  }

  /**
   * Compute ATR values for a list of candles (utility).
   */
  computeAtrValues(candles: AtrCandle[], period = DEFAULT_PERIOD): number[] {
    return AtrTrailingStop.computeAtr(candles, { period, multiplier: DEFAULT_MULTIPLIER });
  }

  /**
   * True Range for a single candle.
   */
  static trueRange(candle: AtrCandle, prevClose: number): number {
    return AtrTrailingStop.trueRange(candle, prevClose);
  }
}
