/**
 * Herd Behavior Detector V2 — extends BasePolymarketStrategy.
 *
 * Measures correlation of price movements across unrelated markets.
 * When avg pairwise correlation exceeds threshold, herding is detected.
 * Tracks herd intensity with EMA — fades the herd at peak (trade opposite).
 *
 * Herd moving prices up → BUY NO (fade). Herd moving prices down → BUY YES.
 * Pure math in ./herd-behavior-math-helpers.ts
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  calcReturn,
  calcAvgPairwiseCorrelation,
  detectHerdPeak,
  calcHerdDirection,
  updateEma,
} from './herd-behavior-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface HerdBehaviorDetectorConfig extends BaseStrategyConfig {
  herdThreshold: number;
  returnWindow: number;
  herdEmaAlpha: number;
  minMarkets: number;
}

export const DEFAULT_CONFIG: HerdBehaviorDetectorConfig = {
  herdThreshold: 0.6,
  returnWindow: 10,
  herdEmaAlpha: 0.15,
  minMarkets: 5,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'herd-behavior-detector' as StrategyName;

// ── Strategy class ───────────────────────────────────────────────────────────

export class HerdBehaviorDetectorStrategy extends BasePolymarketStrategy {
  private readonly cfg: HerdBehaviorDetectorConfig;
  private readonly priceHistory = new Map<string, number[]>();

  /** Global herd state — shared across all markets */
  private prevHerdEma: number | null = null;
  private currentHerdEma: number | null = null;

  constructor(deps: StrategyDeps, config: Partial<HerdBehaviorDetectorConfig> = {}) {
    const fullConfig: HerdBehaviorDetectorConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    if (history.length > this.cfg.returnWindow + 1) {
      history.splice(0, history.length - (this.cfg.returnWindow + 1));
    }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    // 1. Collect prices for all valid markets
    const validMarkets: { market: GammaMarket; prices: number[] }[] = [];

    for (const market of markets) {
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.getPrices(market.yesTokenId);
        if (prices.length >= 2) {
          validMarkets.push({ market, prices });
        }
      } catch (err) {
        logger.debug('Fetch error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }

    if (validMarkets.length < this.cfg.minMarkets) return;

    // 2. Build return series for each market
    const returnSeries: number[][] = [];
    const marketReturns: { market: GammaMarket; ret: number }[] = [];

    for (const { market, prices } of validMarkets) {
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push(prices[i - 1] === 0 ? 0 : (prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      if (returns.length > 0) {
        returnSeries.push(returns);
        marketReturns.push({ market, ret: calcReturn(prices) });
      }
    }

    // 3. Calculate avg pairwise correlation and update herd EMA
    const avgCorr = calcAvgPairwiseCorrelation(returnSeries);
    this.prevHerdEma = this.currentHerdEma;
    this.currentHerdEma = updateEma(this.currentHerdEma, avgCorr, this.cfg.herdEmaAlpha);

    if (this.prevHerdEma === null || this.currentHerdEma === null) return;
    if (!detectHerdPeak(this.prevHerdEma, this.currentHerdEma, this.cfg.herdThreshold)) return;

    // 4. Determine herd direction and fade it
    const direction = calcHerdDirection(marketReturns.map(mr => mr.ret));
    if (direction === 'flat') return;

    const fadeSide: 'yes' | 'no' = direction === 'up' ? 'no' : 'yes';

    // 5. Enter positions on extreme movers
    for (const { market } of marketReturns) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      const prices = this.getPrices(market.yesTokenId);
      if (prices.length === 0) continue;
      const currentMid = prices[prices.length - 1];
      const tokenId = fadeSide === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
      const entryPrice = fadeSide === 'yes' ? currentMid : (1 - currentMid);

      if (entryPrice <= 0 || entryPrice >= 1) continue;

      try {
        await this.enterPosition(tokenId, market.conditionId, fadeSide, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Herd fade entry', this.strategyName, {
          conditionId: market.conditionId, side: fadeSide,
          entryPrice: entryPrice.toFixed(4),
          avgCorrelation: avgCorr.toFixed(4),
          herdEma: this.currentHerdEma.toFixed(4),
          direction,
        });
      } catch (err) {
        logger.debug('Entry error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface HerdBehaviorDetectorDeps extends StrategyDeps {
  config?: Partial<HerdBehaviorDetectorConfig>;
}

export function createHerdBehaviorDetectorTick(
  deps: HerdBehaviorDetectorDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new HerdBehaviorDetectorStrategy(baseDeps, config);
  return strategy.toTickFn();
}
