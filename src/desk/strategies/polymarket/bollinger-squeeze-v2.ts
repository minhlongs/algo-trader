/**
 * Bollinger Band Squeeze V2 — extends BasePolymarketStrategy.
 *
 * Detects low-volatility squeeze and trades breakout direction.
 * When price breaks above upper band → BUY YES (bullish).
 * When price breaks below lower band → BUY NO (bearish).
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

export interface BollingerSqueezeConfig extends BaseStrategyConfig {
  smaWindow: number;
  bandMultiplier: number;
  squeezeThreshold: number;
  widthWindow: number;
}

export const DEFAULT_CONFIG: BollingerSqueezeConfig = {
  smaWindow: 20,
  bandMultiplier: 2.0,
  squeezeThreshold: 0.6,
  widthWindow: 30,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME = 'bollinger-squeeze' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcSMA(prices: number[]): number {
  if (prices.length === 0) return 0;
  let sum = 0;
  for (const p of prices) sum += p;
  return sum / prices.length;
}

export function calcStdDev(prices: number[], mean: number): number {
  if (prices.length === 0) return 0;
  let sumSq = 0;
  for (const p of prices) {
    const diff = p - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / prices.length);
}

export function calcBands(
  sma: number,
  std: number,
  multiplier: number,
): { upper: number; lower: number; width: number } {
  const upper = sma + multiplier * std;
  const lower = sma - multiplier * std;
  const width = sma === 0 ? 0 : (upper - lower) / sma;
  return { upper, lower, width };
}

export function isSqueezing(currentWidth: number, avgWidth: number, threshold: number): boolean {
  return currentWidth < avgWidth * threshold;
}

export function detectBreakout(
  price: number,
  upper: number,
  lower: number,
): 'bullish' | 'bearish' | null {
  if (price > upper) return 'bullish';
  if (price < lower) return 'bearish';
  return null;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class BollingerSqueezeStrategy extends BasePolymarketStrategy {
  private readonly cfg: BollingerSqueezeConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly widthHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<BollingerSqueezeConfig> = {}) {
    const fullConfig: BollingerSqueezeConfig = { ...DEFAULT_CONFIG, ...config };
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
    if (history.length > this.cfg.smaWindow) {
      history.splice(0, history.length - this.cfg.smaWindow);
    }
  }

  private recordWidth(tokenId: string, width: number): void {
    let history = this.widthHistory.get(tokenId);
    if (!history) {
      history = [];
      this.widthHistory.set(tokenId, history);
    }
    history.push(width);
    if (history.length > this.cfg.widthWindow) {
      history.splice(0, history.length - this.cfg.widthWindow);
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
        if (prices.length < this.cfg.smaWindow) continue;

        const sma = calcSMA(prices);
        const std = calcStdDev(prices, sma);
        const bands = calcBands(sma, std, this.cfg.bandMultiplier);

        this.recordWidth(market.yesTokenId, bands.width);
        const widths = this.widthHistory.get(market.yesTokenId) ?? [];
        if (widths.length < 2) continue;

        const avgWidth = calcSMA(widths);
        if (!isSqueezing(bands.width, avgWidth, this.cfg.squeezeThreshold)) continue;

        const breakout = detectBreakout(ba.mid, bands.upper, bands.lower);
        if (!breakout) continue;

        const side: 'yes' | 'no' = breakout === 'bullish' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Bollinger squeeze entry', this.strategyName, {
          sma: sma.toFixed(4), std: std.toFixed(4),
          upper: bands.upper.toFixed(4), lower: bands.lower.toFixed(4),
          width: bands.width.toFixed(4), avgWidth: avgWidth.toFixed(4),
          breakout,
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

export interface BollingerSqueezeDeps extends StrategyDeps {
  config?: Partial<BollingerSqueezeConfig>;
}

export function createBollingerSqueezeTick(deps: BollingerSqueezeDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new BollingerSqueezeStrategy(baseDeps, config);
  return strategy.toTickFn();
}
