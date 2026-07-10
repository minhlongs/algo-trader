/**
 * Correlation Matrix Service (Platform Layer)
 *
 * Wraps @desk/risk PortfolioCorrelation with:
 * - Redis caching (5-min TTL)
 * - 50-position cap
 * - Diversification score
 * - High-correlation pair detection
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import {
  PortfolioCorrelation,
  type CorrelationMatrix,
  type CorrelationPair,
} from '@desk/risk';
import type { CorrelationRequest, CorrelationResponse } from './types';

const CACHE_TTL = 300; // 5 minutes
const MAX_POSITIONS = 50;

export class CorrelationMatrixService {
  private redis: RedisClientType;

  constructor(redis?: RedisClientType) {
    this.redis = redis || getRedisClient();
  }

  /**
   * Compute correlation matrix across all positions.
   * Result cached per userId for 5 minutes.
   */
  async compute(request: CorrelationRequest, userId: string): Promise<CorrelationResponse> {
    const startMs = performance.now();

    // Cap at 50 positions
    const positions = request.positions.length > MAX_POSITIONS
      ? request.positions.slice(0, MAX_POSITIONS)
      : request.positions;

    if (positions.length > MAX_POSITIONS) {
      logger.warn('[CorrelationMatrix] Positions capped', {
        requested: request.positions.length,
        max: MAX_POSITIONS,
      });
    }

    // Check cache
    const cached = await this.getCached(userId);
    if (cached) {
      return {
        ...cached,
        cachedAt: new Date().toISOString(),
        computedMs: performance.now() - startMs,
      };
    }

    // Build return series map
    const returnMap: Record<string, number[]> = {};
    for (const p of positions) {
      returnMap[p.symbol] = p.returns;
    }

    const matrix: CorrelationMatrix = PortfolioCorrelation.buildCorrelationMatrix(returnMap);
    const highlyCorrelated = PortfolioCorrelation.findHighlyCorrelated(matrix, 0.7);
    const diversificationScore = PortfolioCorrelation.diversificationScore(matrix);

    const response: CorrelationResponse = {
      success: true,
      data: {
        symbols: matrix.symbols,
        matrix: matrix.matrix,
        highlyCorrelatedPairs: highlyCorrelated,
        diversificationScore,
      },
      computedMs: performance.now() - startMs,
    };

    // Cache
    if (matrix.symbols.length >= 2) {
      await this.setCached(userId, {
        success: true,
        data: response.data,
      });
    }

    return response;
  }

  /**
   * Compute pairwise correlation between two specific symbols.
   */
  computePair(symbolA: string, returnsA: number[], symbolB: string, returnsB: number[]): {
    correlation: number;
    strength: CorrelationPair['strength'] | null;
  } {
    if (returnsA.length < 3 || returnsB.length < 3) {
      return { correlation: NaN, strength: null };
    }

    const r = PortfolioCorrelation.pearsonCorrelation(returnsA, returnsB);
    if (isNaN(r)) return { correlation: NaN, strength: null };

    const abs = Math.abs(r);
    let strength: CorrelationPair['strength'];
    if (abs >= 0.7) strength = r > 0 ? 'strong_positive' : 'strong_negative';
    else if (abs >= 0.4) strength = r > 0 ? 'moderate_positive' : 'moderate_negative';
    else strength = 'weak';

    return { correlation: r, strength };
  }

  /**
   * Check for concentration risk — any single pair above threshold.
   */
  detectConcentrationRisk(correlation: CorrelationResponse): { risk: boolean; pairs: CorrelationPair[] } {
    const riskyPairs = correlation.data.highlyCorrelatedPairs.filter(
      (p) => p.correlation >= 0.8,
    );
    return {
      risk: riskyPairs.length > 0,
      pairs: riskyPairs,
    };
  }

  private async getCached(userId: string): Promise<{ success: boolean; data: CorrelationResponse['data'] } | null> {
    try {
      const raw = await this.redis.get(`risk:correlation:${userId}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async setCached(
    userId: string,
    value: { success: boolean; data: CorrelationResponse['data'] },
  ): Promise<void> {
    try {
      await this.redis.setex(`risk:correlation:${userId}`, CACHE_TTL, JSON.stringify(value));
    } catch (err) {
      logger.warn('[CorrelationMatrix] Cache write failed', { error: String(err) });
    }
  }

  /**
   * Invalidate cached correlation for a user.
   */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`risk:correlation:${userId}`);
  }
}
