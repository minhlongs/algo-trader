/**
 * Tail Risk Harvester V2 — extends BasePolymarketStrategy.
 *
 * Harvests premium from extreme-probability markets (near 0 or 1) where
 * tail risk is mispriced. Sells the extreme (buys opposite) when historical
 * reversion data suggests prices will revert from extremes.
 *
 * Price > extremeHigh → BUY NO (bet it won't resolve YES).
 * Price < extremeLow → BUY YES (bet it won't resolve NO).
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

export interface TailRiskHarvesterConfig extends BaseStrategyConfig {
  extremeHigh: number;
  extremeLow: number;
  minReversionRate: number;
  reversionWindow: number;
}

export const DEFAULT_CONFIG: TailRiskHarvesterConfig = {
  extremeHigh: 0.92,
  extremeLow: 0.08,
  minReversionRate: 0.3,
  reversionWindow: 30,
  minVolume: 5000,
  takeProfitPct: 0.015,
  stopLossPct: 0.05,
  maxHoldMs: 30 * 60_000,
  maxPositions: 5,
  cooldownMs: 180_000,
  positionSize: '8',
};

const STRATEGY_NAME = 'tail-risk-harvester' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function isExtremePrice(price: number, extremeHigh: number, extremeLow: number): 'high' | 'low' | null {
  if (price > extremeHigh) return 'high';
  if (price < extremeLow) return 'low';
  return null;
}

export function calcReversionRate(prices: number[], extremeHigh: number, extremeLow: number): number {
  if (prices.length < 2) return 0;
  let extremeCount = 0, reversionCount = 0;
  for (let i = 0; i < prices.length - 1; i++) {
    const currentExtreme = isExtremePrice(prices[i], extremeHigh, extremeLow);
    if (currentExtreme !== null) {
      extremeCount++;
      if (isExtremePrice(prices[i + 1], extremeHigh, extremeLow) === null) {
        reversionCount++;
      }
    }
  }
  if (extremeCount === 0) return 0;
  return reversionCount / extremeCount;
}

export function calcPremium(price: number): number {
  return Math.min(price, 1 - price);
}

export function calcExpectedValue(premium: number, reversionRate: number): number {
  return premium * reversionRate;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class TailRiskHarvesterStrategy extends BasePolymarketStrategy {
  private readonly cfg: TailRiskHarvesterConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<TailRiskHarvesterConfig> = {}) {
    const fullConfig: TailRiskHarvesterConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    if (history.length > this.cfg.reversionWindow) {
      history.splice(0, history.length - this.cfg.reversionWindow);
    }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
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
        const prices = this.getPrices(market.yesTokenId);

        const extreme = isExtremePrice(ba.mid, this.cfg.extremeHigh, this.cfg.extremeLow);
        if (extreme === null) continue;
        if (prices.length < 2) continue;

        const reversionRate = calcReversionRate(prices, this.cfg.extremeHigh, this.cfg.extremeLow);
        if (reversionRate < this.cfg.minReversionRate) continue;

        const premium = calcPremium(ba.mid);
        const ev = calcExpectedValue(premium, reversionRate);
        if (ev <= 0) continue;

        // extreme=low → BUY YES (bet won't resolve NO), extreme=high → BUY NO
        const side: 'yes' | 'no' = extreme === 'low' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Tail risk entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4), extreme,
          premium: premium.toFixed(4), ev: ev.toFixed(4),
          reversionRate: reversionRate.toFixed(4),
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

export interface TailRiskHarvesterDeps extends StrategyDeps {
  config?: Partial<TailRiskHarvesterConfig>;
}

export function createTailRiskHarvesterTick(deps: TailRiskHarvesterDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new TailRiskHarvesterStrategy(baseDeps, config);
  return strategy.toTickFn();
}
