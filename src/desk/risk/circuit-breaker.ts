/**
 * Circuit Breaker
 * Halts trading on anomalies (loss streak, latency spike, volatility, drawdown)
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import { DrawdownMonitor } from './drawdown-monitor';
import {
  type CircuitBreakerConfig,
  type CircuitState,
  type CircuitStatus,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker-types';
import { logCircuitBreakerTripped, logCircuitBreakerReset } from './circuit-breaker-audit';

export { DEFAULT_CIRCUIT_BREAKER_CONFIG, type CircuitBreakerConfig, type CircuitState, type CircuitStatus } from './circuit-breaker-types';

export class CircuitBreaker {
  private redis: RedisClientType;
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'CLOSED';
  private triggeredAt?: number;
  private reason?: string;
  private localLossStreak = 0;
  private drawdownMonitor?: DrawdownMonitor;

  constructor(redis?: RedisClientType, config?: Partial<CircuitBreakerConfig>, drawdownMonitor?: DrawdownMonitor) {
    this.redis = redis || getRedisClient();
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.drawdownMonitor = drawdownMonitor;
  }

  /** Get circuit breaker status */
  async getStatus(): Promise<CircuitStatus> {
    try {
      const status = await this.redis.hgetall('circuit_breaker:status');
      if (status?.state) {
        this.state = status.state as CircuitState;
        this.reason = status.reason;
        this.triggeredAt = status.triggeredAt ? parseInt(status.triggeredAt) : undefined;
      }
    } catch {
      // Fall back to in-memory state
    }
    return this.getSyncStatus();
  }

  /** Get synchronous in-memory snapshot */
  getSyncStatus(): CircuitStatus {
    if (this.state === 'OPEN' && this.triggeredAt) {
      const elapsed = Date.now() - this.triggeredAt;
      const remaining = Math.max(0, this.config.cooldownMs - elapsed);
      if (remaining <= 0) {
        this.state = 'HALF_OPEN';
        return { state: 'HALF_OPEN', reason: this.reason, triggeredAt: this.triggeredAt, cooldownRemaining: 0 };
      }
      return { state: 'OPEN', reason: this.reason, triggeredAt: this.triggeredAt, cooldownRemaining: remaining };
    }
    return { state: this.state, reason: this.reason, triggeredAt: this.triggeredAt };
  }

  /** Check if trading is allowed */
  async canTrade(): Promise<boolean> {
    const status = await this.getStatus();
    return status.state !== 'OPEN';
  }

  /** Record loss - increment loss streak */
  async recordLoss(): Promise<void> {
    this.localLossStreak += 1;
    let newStreak = this.localLossStreak;
    try {
      const key = 'circuit_breaker:loss_streak';
      const current = parseInt((await this.redis.get(key)) || '0');
      newStreak = current + 1;
      this.localLossStreak = newStreak;
      await this.redis.set(key, newStreak.toString());
    } catch {
      // In-memory fallback
    }

    if (newStreak >= this.config.maxLossStreak) {
      await this.trip('Loss streak', `${newStreak} consecutive losses`);
    }
  }

  /** Record win - reset loss streak */
  async recordWin(): Promise<void> {
    this.localLossStreak = 0;
    try {
      await this.redis.del('circuit_breaker:loss_streak');
    } catch {
      // In-memory fallback
    }
  }

  /** Check latency - trip if exceeds threshold */
  async checkLatency(latencyMs: number): Promise<boolean> {
    if (latencyMs > this.config.maxLatencyMs) {
      await this.trip('Latency spike', `${latencyMs}ms exceeds ${this.config.maxLatencyMs}ms`);
      return false;
    }
    return true;
  }

  /** Check volatility - trip if exceeds threshold */
  async checkVolatility(volatilityPercent: number): Promise<boolean> {
    if (volatilityPercent > this.config.maxVolatilityPercent) {
      await this.trip('High volatility', `${volatilityPercent}% exceeds ${this.config.maxVolatilityPercent}%`);
      return false;
    }
    return true;
  }

  /** Trip circuit breaker */
  private async trip(reason: string, details?: string): Promise<void> {
    this.state = 'OPEN';
    this.reason = `${reason}: ${details || ''}`.trim();
    this.triggeredAt = Date.now();
    try {
      await this.redis.hset('circuit_breaker:status', {
        state: 'OPEN',
        reason: this.reason,
        triggeredAt: this.triggeredAt.toString(),
      });
    } catch (err) {
      logger.warn('[CircuitBreaker] Failed to update status in Redis:', { err });
    }
    await logCircuitBreakerTripped(reason, details, this.triggeredAt);
    logger.warn(`[CircuitBreaker] TRIPPED: ${reason} - ${details}`);
  }

  /** Set circuit to half-open (after cooldown) */
  private async setHalfOpen(): Promise<void> {
    this.state = 'HALF_OPEN';
    try {
      await this.redis.hset('circuit_breaker:status', 'state', 'HALF_OPEN');
    } catch {
      // In-memory fallback
    }
  }

  /** Reset circuit breaker to closed */
  async reset(): Promise<void> {
    this.state = 'CLOSED';
    this.triggeredAt = undefined;
    this.reason = undefined;
    this.localLossStreak = 0;
    try {
      await this.redis.hset('circuit_breaker:status', { state: 'CLOSED', reason: '', triggeredAt: '' });
      await this.redis.del('circuit_breaker:loss_streak');
    } catch (err) {
      logger.warn('[CircuitBreaker] Failed to reset state in Redis:', { err });
    }
    await logCircuitBreakerReset();
    logger.info('[CircuitBreaker] RESET');
  }

  /** Manual halt - force open circuit */
  async halt(reason: string): Promise<void> {
    await this.trip('Manual halt', reason);
  }

  /** Check daily drawdown - trip if exceeds max threshold */
  async checkDailyDrawdown(): Promise<boolean> {
    if (!this.drawdownMonitor) return true;
    const metrics = await this.drawdownMonitor.getMetrics();
    if (metrics.dailyDrawdown >= this.config.maxDailyDrawdown) {
      await this.trip(
        'Daily drawdown breach',
        `${(metrics.dailyDrawdown * 100).toFixed(2)}% exceeds ${(this.config.maxDailyDrawdown * 100).toFixed(2)}%`
      );
      return false;
    }
    return true;
  }
}
