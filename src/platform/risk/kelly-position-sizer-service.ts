/**
 * Kelly Criterion Position Sizer Service (Platform Layer)
 *
 * Wraps @desk/risk KellyPositionSizer with:
 * - User-level configuration persistence in Redis
 * - Historical win rate / avg win-loss derivation from trade history
 * - Clamp to minimum position size when Kelly produces zero/negative
 * - Correlation-adjusted sizing
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import {
  KellyPositionSizer,
  type KellySizingInput,
  type KellySizingResult,
} from '@desk/risk';
import type { KellySizingRequest, KellySizingResponse } from './types';

const CACHE_TTL = 600; // 10 minutes for Kelly config

export class KellyPositionSizerService {
  private redis: RedisClientType;

  constructor(redis?: RedisClientType) {
    this.redis = redis || getRedisClient();
  }

  /**
   * Calculate position size from Kelly parameters.
   * Optionally overlays user-stored config.
   */
  calculate(request: KellySizingRequest, userId?: string): KellySizingResponse {
    const startMs = performance.now();

    // Merge with user-stored config if available
    const mergedConfig = userId ? this.getStoredConfig(userId) : undefined;
    const kellyFraction = request.kellyFraction ?? 0.25;

    const sizer = new KellyPositionSizer({
      kellyFraction,
      maxPositionFraction: 0.05,
      minPositionUsd: 10,
    });

    const input: KellySizingInput = {
      winProbability: request.winProbability,
      winLossRatio: request.winLossRatio,
      portfolioValue: request.portfolioValue,
      correlation: request.correlation ?? 0,
      currentExposure: request.currentExposure ?? 0,
    };

    const result = sizer.calculatePositionSize(input);

    return {
      success: true,
      data: result,
      computedMs: performance.now() - startMs,
    };
  }

  /**
   * Derive Kelly inputs from historical trade data.
   * Scans last N trades for win rate and avg win/loss.
   */
  async fromTradeHistory(
    userId: string,
    tradeReturns: number[],
    portfolioValue: number,
    correlation = 0,
    kellyFraction = 0.25,
  ): Promise<KellySizingResponse> {
    if (tradeReturns.length === 0) {
      return {
        success: true,
        data: {
          positionSizeUsd: 0,
          kellyRaw: 0,
          kellyAdjusted: 0,
          cappedByMax: false,
          cappedByManaged: false,
          fractionUsed: kellyFraction,
          portfolioPercent: 0,
          correlation,
        },
        computedMs: 0,
      };
    }

    const wins = tradeReturns.filter((r) => r > 0);
    const losses = tradeReturns.filter((r) => r <= 0);
    const winProbability = wins.length / tradeReturns.length;

    const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r, 0) / losses.length) : 1;

    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    return this.calculate(
      {
        winProbability,
        winLossRatio,
        portfolioValue,
        correlation,
        kellyFraction,
      },
      userId,
    );
  }

  /**
   * Store user-specific Kelly config in Redis.
   */
  async storeConfig(userId: string, kellyFraction: number): Promise<void> {
    const clamped = Math.max(0.1, Math.min(0.5, kellyFraction));
    try {
      await this.redis.setex(
        `risk:kelly:config:${userId}`,
        CACHE_TTL,
        JSON.stringify({ kellyFraction: clamped }),
      );
      logger.info('[KellyPositionSizerService] Config stored', { userId, kellyFraction: clamped });
    } catch (err) {
      logger.warn('[KellyPositionSizerService] Config store failed', { error: String(err) });
    }
  }

  /**
   * Retrieve stored config.
   */
  private async getStoredConfig(userId: string): Promise<{ kellyFraction: number } | undefined> {
    try {
      const raw = await this.redis.get(`risk:kelly:config:${userId}`);
      if (!raw) return undefined;
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  /**
   * Validate Kelly inputs and return human-readable warnings.
   */
  static validateInputs(input: KellySizingRequest): string[] {
    const warnings: string[] = [];

    if (input.winProbability <= 0 || input.winProbability >= 1) {
      warnings.push('Win probability must be between 0 and 1 (exclusive)');
    }
    if (input.winLossRatio <= 0) {
      warnings.push('Win/loss ratio must be positive — check historical trade data');
    }
    if (input.portfolioValue <= 0) {
      warnings.push('Portfolio value must be positive');
    }
    if ((input.correlation ?? 0) < -1 || (input.correlation ?? 0) > 1) {
      warnings.push('Correlation must be between -1 and 1');
    }
    if (input.kellyFraction !== undefined && (input.kellyFraction <= 0 || input.kellyFraction > 0.5)) {
      warnings.push('Kelly fraction should be between 0.1 and 0.5');
    }

    return warnings;
  }
}
