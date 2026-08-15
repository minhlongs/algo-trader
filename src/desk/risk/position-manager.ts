/**
 * Position Manager
 * Tracks exposure per symbol/exchange, enforces limits
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type { PositionConfig, Position, PositionValidation, ExposureSummary } from './position-manager-types';
import { validateExposureLimits, buildExposureSummary } from './position-validation';

export type { PositionConfig, Position, PositionValidation, ExposureSummary };

export class PositionManager {
  private redis: RedisClientType;
  private config: PositionConfig;

  constructor(config: Partial<PositionConfig> = {}) {
    this.redis = getRedisClient();
    this.config = {
      maxPositionPerSymbol: config.maxPositionPerSymbol ?? 10_000,
      maxPositionPerExchange: config.maxPositionPerExchange ?? 50_000,
      maxTotalExposure: config.maxTotalExposure ?? 100_000,
      maxLongExposure: config.maxLongExposure ?? 75_000,
      maxShortExposure: config.maxShortExposure ?? 50_000,
    };
  }

  /** Open a new position */
  async openPosition(symbol: string, exchange: string, side: 'long' | 'short', amount: number, price: number): Promise<boolean> {
    const validation = await this.validatePosition(symbol, exchange, side, amount);
    if (!validation.valid) {
      logger.warn(`[PositionManager] Rejected: ${validation.reason}`);
      return false;
    }
    const key = `position:${symbol}:${exchange}`;
    await this.redis.hset(key, {
      symbol, exchange, side,
      amount: amount.toString(),
      entryPrice: price.toString(),
      currentValue: (amount * price).toString(),
      unrealizedPnl: '0',
      openedAt: Date.now().toString(),
    });
    await this.updateExposureCache();
    logger.info(`[PositionManager] Opened ${side} ${amount} ${symbol} @ ${price} on ${exchange}`);
    return true;
  }

  /** Close position and return realized PnL */
  async closePosition(symbol: string, exchange: string, exitPrice: number): Promise<number> {
    const position = await this.getPosition(symbol, exchange);
    if (!position) return 0;
    const pnl = position.side === 'long'
      ? (exitPrice - position.entryPrice) * position.amount
      : (position.entryPrice - exitPrice) * position.amount;
    await this.redis.del(`position:${symbol}:${exchange}`);
    await this.updateExposureCache();
    logger.info(`[PositionManager] Closed ${position.side} ${symbol} @ ${exitPrice}, PnL: ${pnl}`);
    return pnl;
  }

  /** Mark to market (update current value) */
  async markToMarket(symbol: string, exchange: string, currentPrice: number): Promise<void> {
    const position = await this.getPosition(symbol, exchange);
    if (!position) return;
    const currentValue = position.amount * currentPrice;
    const unrealizedPnl = position.side === 'long'
      ? (currentPrice - position.entryPrice) * position.amount
      : (position.entryPrice - currentPrice) * position.amount;
    await this.redis.hset(`position:${symbol}:${exchange}`, { currentValue: currentValue.toString(), unrealizedPnl: unrealizedPnl.toString() });
  }

  /** Validate position against all exposure limits */
  async validatePosition(symbol: string, exchange: string, side: 'long' | 'short', amount: number): Promise<PositionValidation> {
    const summary = await this.getExposureSummary();
    return validateExposureLimits(this.config, summary, symbol, exchange, side, amount);
  }

  /** Get current position for a symbol/exchange pair */
  async getPosition(symbol: string, exchange: string): Promise<Position | null> {
    const data = await this.redis.hgetall(`position:${symbol}:${exchange}`);
    if (!data || !data.symbol) return null;
    return {
      symbol: data.symbol, exchange: data.exchange, side: data.side as 'long' | 'short',
      amount: parseFloat(data.amount), entryPrice: parseFloat(data.entryPrice),
      currentValue: parseFloat(data.currentValue), unrealizedPnl: parseFloat(data.unrealizedPnl),
      openedAt: parseInt(data.openedAt),
    };
  }

  /** Get all open positions */
  async getAllPositions(): Promise<Position[]> {
    const keys = await this.redis.keys('position:*');
    const positions: Position[] = [];
    for (const key of keys) {
      const data = await this.redis.hgetall(key);
      if (!data || !data.amount) continue;
      positions.push({
        symbol: data.symbol, exchange: data.exchange, side: data.side as 'long' | 'short',
        amount: parseFloat(data.amount), entryPrice: parseFloat(data.entryPrice),
        currentValue: parseFloat(data.currentValue), unrealizedPnl: parseFloat(data.unrealizedPnl),
        openedAt: parseInt(data.openedAt),
      });
    }
    return positions;
  }

  /** Get aggregated exposure summary */
  async getExposureSummary(): Promise<ExposureSummary> { return buildExposureSummary(this.redis); }

  /** Close all positions (emergency) */
  async closeAllPositions(exitPrices: Map<string, number>): Promise<number> {
    const positions = await this.getAllPositions();
    let totalPnl = 0;
    for (const position of positions) {
      const exitPrice = exitPrices.get(`${position.symbol}:${position.exchange}`) || position.entryPrice;
      totalPnl += await this.closePosition(position.symbol, position.exchange, exitPrice);
    }
    return totalPnl;
  }

  private async updateExposureCache(): Promise<void> {
    const summary = await this.getExposureSummary();
    await this.redis.set('position:exposure:total', JSON.stringify({
      totalLong: summary.totalLong, totalShort: summary.totalShort,
      netExposure: summary.netExposure, timestamp: Date.now(),
    }));
  }
}
