/**
 * Event Deadline Scalper V2 — extends BasePolymarketStrategy.
 *
 * Exploits accelerating price discovery as markets approach resolution
 * deadline. As deadline nears, prices move toward extremes (0 or 1) faster.
 * Trades in the direction of the acceleration.
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

export interface EventDeadlineScalperConfig extends BaseStrategyConfig {
  urgencyThreshold: number;
  minTimeUrgency: number;
  momentumWindow: number;
}

export const DEFAULT_CONFIG: EventDeadlineScalperConfig = {
  urgencyThreshold: 0.05,
  minTimeUrgency: 0.7,
  momentumWindow: 10,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 10 * 60_000,
  maxPositions: 4,
  cooldownMs: 60_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'event-deadline-scalper' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcTimeUrgency(now: number, startTime: number, endTime: number): number {
  if (endTime <= startTime) return 1;
  const elapsed = now - startTime;
  const total = endTime - startTime;
  return Math.max(0, Math.min(1, elapsed / total));
}

export function calcMomentumTowardExtreme(prices: number[]): number {
  if (prices.length < 2) return 0;
  const current = prices[prices.length - 1];
  const previous = prices[0];
  const nearestExtreme = current > 0.5 ? 1 : 0;
  const direction = nearestExtreme === 1 ? 1 : -1;
  return Math.max(0, (current - previous) * direction);
}

export function calcUrgencyScore(momentum: number, timeUrgency: number): number {
  return momentum * (1 + timeUrgency * timeUrgency);
}

export function determineDirection(currentPrice: number): 'yes' | 'no' {
  return currentPrice > 0.5 ? 'yes' : 'no';
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class EventDeadlineScalperStrategy extends BasePolymarketStrategy {
  private readonly cfg: EventDeadlineScalperConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<EventDeadlineScalperConfig> = {}) {
    const fullConfig: EventDeadlineScalperConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    if (history.length > this.cfg.momentumWindow) {
      history.splice(0, history.length - this.cfg.momentumWindow);
    }
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;
    const now = Date.now();

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;
      if (!market.endDate) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length < 2) continue;

        const endTime = new Date(market.endDate).getTime();
        const startTime = endTime - 30 * 24 * 60 * 60 * 1000;
        const timeUrgency = calcTimeUrgency(now, startTime, endTime);
        if (timeUrgency < this.cfg.minTimeUrgency) continue;

        const momentum = calcMomentumTowardExtreme(prices);
        if (momentum <= 0) continue;

        const urgencyScore = calcUrgencyScore(momentum, timeUrgency);
        if (urgencyScore < this.cfg.urgencyThreshold) continue;

        const side = determineDirection(ba.mid);
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Deadline scalper entry', this.strategyName, {
          urgencyScore: urgencyScore.toFixed(4),
          momentum: momentum.toFixed(4),
          timeUrgency: timeUrgency.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface EventDeadlineScalperDeps extends StrategyDeps {
  config?: Partial<EventDeadlineScalperConfig>;
}

export function createEventDeadlineScalperTick(deps: EventDeadlineScalperDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new EventDeadlineScalperStrategy(baseDeps, config);
  return strategy.toTickFn();
}
