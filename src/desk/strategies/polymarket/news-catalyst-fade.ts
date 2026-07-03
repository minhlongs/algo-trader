/**
 * News Catalyst Fade Strategy — V2 implementation.
 *
 * Fades the initial price reaction to news events by entering
 * counter-trend when the market moves too far too fast. The strategy
 * tracks price velocity: when the absolute price change over a short
 * window exceeds a threshold, it bets on reversion.
 *
 * Entry: price moved > spikePct in a single tick direction -> fade it
 * Exit: price reverts toward pre-spike level or TP/SL/maxHold
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface NewsCatalystFadeConfig extends BaseStrategyConfig {
  /** Price movement threshold to detect spike (as fraction, e.g. 0.05 = 5%) */
  spikePct: number;
  /** Lookback ticks for velocity calculation */
  velocityWindow: number;
  /** Fraction of spike to retrace before closing (0.5 = 50% retrace) */
  retraceTarget: number;
  /** Expected fade edge as fraction */
  minEdge: number;
}

export const DEFAULT_CONFIG: NewsCatalystFadeConfig = {
  spikePct: 0.04,
  velocityWindow: 3,
  retraceTarget: 0.5,
  minEdge: 0.01,
  minVolume: 2000,
  takeProfitPct: 0.05,
  stopLossPct: 0.03,
  maxHoldMs: 15 * 60_000,
  maxPositions: 3,
  cooldownMs: 180_000,
  positionSize: '15',
};

const STRATEGY_NAME: StrategyName = 'news-catalyst-fade';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Calculate price velocity over window (positive = up, negative = down). */
export function calcVelocity(prices: number[], window: number): number {
  if (prices.length < window + 1) return 0;
  return prices[prices.length - 1]! - prices[prices.length - 1 - window]!;
}

/** Detect a price spike: absolute change > threshold. Returns direction or null. */
export function detectSpike(prices: number[], window: number, spikePct: number): 'yes' | 'no' | null {
  if (prices.length < window + 1) return null;
  const velocity = calcVelocity(prices, window);
  const basePrice = prices[prices.length - 1 - window]!;
  if (basePrice <= 0) return null;
  const changePct = Math.abs(velocity) / basePrice;
  if (changePct < spikePct) return null;
  // Spike up -> fade by betting no; spike down -> fade by betting yes
  return velocity > 0 ? 'no' : 'yes';
}

/** Calculate retrace level: price level at which we take profit on fade. */
export function calcRetracePrice(entryPrice: number, spikeStartPrice: number, side: 'yes' | 'no', retracePct: number): number {
  const spikeMove = Math.abs(entryPrice - spikeStartPrice);
  return side === 'yes'
    ? entryPrice + spikeMove * retracePct
    : entryPrice - spikeMove * retracePct;
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class NewsCatalystFadeStrategy extends BasePolymarketStrategy {
  private readonly cfg: NewsCatalystFadeConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly spikePrices = new Map<string, number>(); // tokenId -> price before spike

  constructor(deps: StrategyDeps, config: Partial<NewsCatalystFadeConfig> = {}) {
    const fullConfig: NewsCatalystFadeConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: retrace hit ───────────────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
  ): { exit: boolean; reason: string } {
    const spikePrice = this.spikePrices.get(pos.tokenId);
    if (!spikePrice) return { exit: false, reason: '' };

    const retraceTarget = calcRetracePrice(pos.entryPrice, spikePrice, pos.side, this.cfg.retraceTarget);
    const hitRetrace = pos.side === 'yes'
      ? currentPrice >= retraceTarget
      : currentPrice <= retraceTarget;

    if (hitRetrace) {
      return { exit: true, reason: 'retrace-hit' };
    }
    return { exit: false, reason: '' };
  }

  // ── Entry scanning ─────────────────────────────────────────────────────

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

        // Track price history
        let prices = this.priceHistory.get(market.yesTokenId);
        if (!prices) {
          prices = [];
          this.priceHistory.set(market.yesTokenId, prices);
        }
        prices.push(ba.mid);
        if (prices.length > this.cfg.velocityWindow * 5) {
          prices.splice(0, prices.length - this.cfg.velocityWindow * 5);
        }

        if (prices.length < this.cfg.velocityWindow + 2) continue;

        const dir = detectSpike(prices, this.cfg.velocityWindow, this.cfg.spikePct);
        if (!dir) continue;

        const spikeStartPrice = prices[prices.length - 1 - this.cfg.velocityWindow]!;
        const tokenId = dir === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = dir === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        // Record pre-spike price for exit calculation
        this.spikePrices.set(tokenId, spikeStartPrice);

        await this.enterPosition(
          tokenId,
          market.conditionId,
          dir,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Fade entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: dir,
          entryPrice: entryPrice.toFixed(4),
          spikeStart: spikeStartPrice.toFixed(4),
          velocity: calcVelocity(prices, this.cfg.velocityWindow).toFixed(4),
        });
      } catch (err) {
        logger.debug('Fade scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createNewsCatalystFadeTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new NewsCatalystFadeStrategy(deps);
  return strategy.toTickFn();
}
