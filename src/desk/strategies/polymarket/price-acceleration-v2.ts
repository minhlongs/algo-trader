/**
 * Price Acceleration V2 — extends BasePolymarketStrategy.
 *
 * Measures second derivative of price (acceleration) to detect momentum
 * building or fading. Positive accel + positive velocity → BUY YES.
 * Positive accel + negative velocity → BUY NO.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface PriceAccelerationConfig extends BaseStrategyConfig {
  velocityWindow: number;
  accelerationWindow: number;
  accelerationThreshold: number;
  minVelocity: number;
}

export const DEFAULT_CONFIG: PriceAccelerationConfig = {
  velocityWindow: 5,
  accelerationWindow: 3,
  accelerationThreshold: 0.001,
  minVelocity: 0.003,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 12 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'price-acceleration' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcVelocity(prices: number[], window: number): number {
  if (prices.length < window + 1 || window <= 0) return 0;
  const end = prices[prices.length - 1];
  const start = prices[prices.length - 1 - window];
  return (end - start) / window;
}

export function calcAcceleration(velocities: number[]): number {
  if (velocities.length < 2) return 0;
  return (velocities[velocities.length - 1] - velocities[0]) / velocities.length;
}

export function isAccelerationSignal(
  accel: number,
  velocity: number,
  config: Pick<PriceAccelerationConfig, 'accelerationThreshold' | 'minVelocity'>,
): boolean {
  return Math.abs(accel) > config.accelerationThreshold && Math.abs(velocity) > config.minVelocity;
}

export function determineDirection(velocity: number): 'yes' | 'no' | null {
  if (velocity > 0) return 'yes';
  if (velocity < 0) return 'no';
  return null;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class PriceAccelerationStrategy extends BasePolymarketStrategy {
  private readonly cfg: PriceAccelerationConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly velocityHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<PriceAccelerationConfig> = {}) {
    const fullConfig: PriceAccelerationConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
    history.push(price);
    const maxLen = this.cfg.velocityWindow + this.cfg.accelerationWindow + 5;
    if (history.length > maxLen) {
      history.splice(0, history.length - maxLen);
    }
  }

  private recordVelocity(tokenId: string, velocity: number): void {
    let history = this.velocityHistory.get(tokenId);
    if (!history) {
      history = [];
      this.velocityHistory.set(tokenId, history);
    }
    history.push(velocity);
    const maxLen = this.cfg.accelerationWindow + 5;
    if (history.length > maxLen) {
      history.splice(0, history.length - maxLen);
    }
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        const velocity = calcVelocity(prices, this.cfg.velocityWindow);

        this.recordVelocity(market.yesTokenId, velocity);
        const velocities = this.velocityHistory.get(market.yesTokenId) ?? [];
        const accel = calcAcceleration(velocities);

        if (!isAccelerationSignal(accel, velocity, this.cfg)) continue;

        const direction = determineDirection(velocity);
        if (!direction) continue;

        const side = direction;
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Acceleration entry', this.strategyName, {
          velocity: velocity.toFixed(6),
          acceleration: accel.toFixed(6),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface PriceAccelerationDeps extends StrategyDeps {
  config?: Partial<PriceAccelerationConfig>;
}

export function createPriceAccelerationTick(deps: PriceAccelerationDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new PriceAccelerationStrategy(baseDeps, config);
  return strategy.toTickFn();
}
