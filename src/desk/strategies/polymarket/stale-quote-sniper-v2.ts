/**
 * Stale Quote Sniper V2 — extends BasePolymarketStrategy.
 *
 * Detects stale/lagging quotes by comparing a market's velocity against
 * aggregate velocity. When one market lags while others move, its resting
 * orders are stale — snipe them.
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

export interface StaleQuoteSniperConfig extends BaseStrategyConfig {
  velocityWindow: number;
  stalenessThreshold: number;
  epsilon: number;
  minAggVelocity: number;
}

export const DEFAULT_CONFIG: StaleQuoteSniperConfig = {
  velocityWindow: 10,
  stalenessThreshold: 5.0,
  epsilon: 0.0001,
  minAggVelocity: 0.005,
  minVolume: 3000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 10 * 60_000,
  maxPositions: 5,
  cooldownMs: 60_000,
  positionSize: '8',
};

const STRATEGY_NAME = 'stale-quote-sniper' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcVelocity(prices: number[]): number {
  if (prices.length < 2) return 0;
  return (prices[prices.length - 1] - prices[0]) / prices.length;
}

export function calcAggregateVelocity(velocities: number[]): number {
  if (velocities.length === 0) return 0;
  let sum = 0;
  for (const v of velocities) sum += Math.abs(v);
  return sum / velocities.length;
}

export function calcStalenessScore(
  aggVelocity: number, marketVelocity: number, epsilon: number,
): number {
  return aggVelocity / (Math.abs(marketVelocity) + epsilon);
}

export function isStaleQuote(
  stalenessScore: number,
  aggVelocity: number,
  config: Pick<StaleQuoteSniperConfig, 'stalenessThreshold' | 'minAggVelocity'>,
): boolean {
  return stalenessScore > config.stalenessThreshold && aggVelocity > config.minAggVelocity;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class StaleQuoteSniperStrategy extends BasePolymarketStrategy {
  private readonly cfg: StaleQuoteSniperConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<StaleQuoteSniperConfig> = {}) {
    const fullConfig: StaleQuoteSniperConfig = { ...DEFAULT_CONFIG, ...config };
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
    if (history.length > this.cfg.velocityWindow) {
      history.splice(0, history.length - this.cfg.velocityWindow);
    }
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    // First pass: collect velocities and mid prices for all valid markets
    const marketVelocities = new Map<string, number>();
    const marketMids = new Map<string, { mid: number; bid: number; ask: number }>();
    const validMarkets: GammaMarket[] = [];

    for (const market of markets) {
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        const velocity = calcVelocity(prices);

        marketVelocities.set(market.yesTokenId, velocity);
        marketMids.set(market.yesTokenId, ba);
        validMarkets.push(market);
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }

    if (marketVelocities.size < 2) return;

    const allVelocities = Array.from(marketVelocities.values());
    const aggVelocity = calcAggregateVelocity(allVelocities);

    let driftSum = 0;
    for (const v of allVelocities) driftSum += v;
    const aggDrift = driftSum / allVelocities.length;

    // Second pass: find stale quotes and enter positions
    for (const market of validMarkets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      const marketVel = marketVelocities.get(market.yesTokenId!) ?? 0;
      const ba = marketMids.get(market.yesTokenId!)!;
      const stalenessScore = calcStalenessScore(aggVelocity, marketVel, this.cfg.epsilon);

      if (!isStaleQuote(stalenessScore, aggVelocity, this.cfg)) continue;

      const side: 'yes' | 'no' = aggDrift > 0 ? 'yes' : 'no';
      const tokenId = side === 'yes' ? market.yesTokenId! : (market.noTokenId ?? market.yesTokenId!);
      const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

      try {
        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Stale quote snipe', this.strategyName, {
          stalenessScore: stalenessScore.toFixed(2),
          aggVelocity: aggVelocity.toFixed(6),
          marketVelocity: marketVel.toFixed(6),
        });
      } catch (err) {
        logger.debug('Entry failed', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface StaleQuoteSniperDeps extends StrategyDeps {
  config?: Partial<StaleQuoteSniperConfig>;
}

export function createStaleQuoteSniperTick(deps: StaleQuoteSniperDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new StaleQuoteSniperStrategy(baseDeps, config);
  return strategy.toTickFn();
}
