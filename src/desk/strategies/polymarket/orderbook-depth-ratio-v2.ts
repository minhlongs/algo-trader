/**
 * Orderbook Depth Ratio V2 — extends BasePolymarketStrategy.
 *
 * Monitors asymmetric orderbook liquidity at multiple depth levels to predict
 * short-term directional moves. depthRatio = SUM(bid_vol) / SUM(ask_vol).
 * Custom exit: depth-ratio reversal past opposite threshold.
 *
 * depthRatio > highThreshold AND z > zScoreThreshold → BUY YES
 * depthRatio < lowThreshold  AND z < -zScoreThreshold → BUY NO
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook, OrderBookLevel } from '../../polymarket/clob-client';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface OrderbookDepthConfig extends BaseStrategyConfig {
  depthLevels: number;
  highThreshold: number;
  lowThreshold: number;
  zScoreThreshold: number;
  momentumAlignRequired: boolean;
  lookbackPeriods: number;
  /** Fallback size when kellySizer is unavailable */
  sizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: OrderbookDepthConfig = {
  depthLevels: 5,
  highThreshold: 3.0,
  lowThreshold: 0.33,
  zScoreThreshold: 1.5,
  momentumAlignRequired: true,
  lookbackPeriods: 20,
  sizeUsdc: 30,
  scanLimit: 15,
  minVolume: 0,
  takeProfitPct: 0.025,
  stopLossPct: 0.018,
  maxHoldMs: 8 * 60_000,
  maxPositions: 4,
  cooldownMs: 60_000,
  positionSize: '30',
};

const STRATEGY_NAME: StrategyName = 'orderbook-depth-ratio';

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcDepthRatio(book: RawOrderBook, levels: number): number {
  const sumVolume = (lvls: OrderBookLevel[], n: number): number => {
    let total = 0;
    const limit = Math.min(n, lvls.length);
    for (let i = 0; i < limit; i++) total += parseFloat(lvls[i].size);
    return total;
  };
  const bidVol = sumVolume(book.bids, levels);
  const askVol = sumVolume(book.asks, levels);
  if (bidVol === 0 && askVol === 0) return 0;
  if (askVol === 0) return Infinity;
  return bidVol / askVol;
}

export function calcDepthZScore(ratios: number[]): number {
  if (ratios.length < 3) return 0;
  const n = ratios.length;
  const mean = ratios.reduce((s, r) => s + r, 0) / n;
  const variance = ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (ratios[n - 1] - mean) / std;
}

export function detectMomentum(prices: number[]): 'up' | 'down' | 'flat' {
  if (prices.length < 3) return 'flat';
  const last3 = prices.slice(-3);
  if (last3[2] > last3[1] && last3[1] > last3[0]) return 'up';
  if (last3[2] < last3[1] && last3[1] < last3[0]) return 'down';
  return 'flat';
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class OrderbookDepthRatioStrategy extends BasePolymarketStrategy {
  private readonly cfg: OrderbookDepthConfig;
  private readonly kellySizer?: KellyPositionSizer;
  private readonly depthHistory = new Map<string, number[]>();
  private readonly priceHistory = new Map<string, number[]>();

  constructor(
    deps: StrategyDeps,
    config: Partial<OrderbookDepthConfig> = {},
    kellySizer?: KellyPositionSizer,
  ) {
    const fullConfig: OrderbookDepthConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.kellySizer = kellySizer;
  }

  private recordDepthRatio(tokenId: string, ratio: number): void {
    let history = this.depthHistory.get(tokenId);
    if (!history) { history = []; this.depthHistory.set(tokenId, history); }
    history.push(ratio);
    const max = this.cfg.lookbackPeriods * 2;
    if (history.length > max) history.splice(0, history.length - max);
  }

  private getDepthWindow(tokenId: string): number[] {
    const history = this.depthHistory.get(tokenId);
    if (!history) return [];
    return history.slice(-this.cfg.lookbackPeriods);
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const max = this.cfg.lookbackPeriods * 2;
    if (history.length > max) history.splice(0, history.length - max);
  }

  private getPriceWindow(tokenId: string): number[] {
    return (this.priceHistory.get(tokenId) ?? []).slice(-this.cfg.lookbackPeriods);
  }

  private getSize(): number {
    return this.kellySizer?.getSize(STRATEGY_NAME).size ?? parseFloat(this.cfg.positionSize);
  }

  /** Depth-ratio reversal exit: if ratio flips to opposite extreme. */
  protected getCustomExitCondition(pos: OpenPosition, _currentPrice: number): { exit: boolean; reason: string } {
    const depthWindow = this.getDepthWindow(pos.tokenId);
    if (depthWindow.length === 0) return { exit: false, reason: '' };
    const currentRatio = depthWindow[depthWindow.length - 1];
    if (pos.side === 'yes' && currentRatio < this.cfg.lowThreshold) {
      return { exit: true, reason: `depth-ratio reversal (ratio=${currentRatio.toFixed(2)}, was long YES)` };
    }
    if (pos.side === 'no' && currentRatio > this.cfg.highThreshold) {
      return { exit: true, reason: `depth-ratio reversal (ratio=${currentRatio.toFixed(2)}, was long NO)` };
    }
    return { exit: false, reason: '' };
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const ratio = calcDepthRatio(book, this.cfg.depthLevels);
        this.recordDepthRatio(market.yesTokenId, ratio);

        const depthWindow = this.getDepthWindow(market.yesTokenId);
        if (depthWindow.length < this.cfg.lookbackPeriods) continue;

        const z = calcDepthZScore(depthWindow);
        const prices = this.getPriceWindow(market.yesTokenId);
        const momentum = detectMomentum(prices);

        let side: 'yes' | 'no' | null = null;
        if (ratio > this.cfg.highThreshold && z > this.cfg.zScoreThreshold) {
          if (!this.cfg.momentumAlignRequired || momentum === 'up' || momentum === 'flat') side = 'yes';
        } else if (ratio < this.cfg.lowThreshold && z < -this.cfg.zScoreThreshold) {
          if (!this.cfg.momentumAlignRequired || momentum === 'down' || momentum === 'flat') side = 'no';
        }
        if (!side) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.getSize());

        logger.debug('Depth ratio entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4),
          depthRatio: ratio.toFixed(3), depthZScore: z.toFixed(2), momentum,
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, { market: market.conditionId, err: String(err) });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
        trackedMarkets: this.depthHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface OrderbookDepthDeps extends StrategyDeps {
  kellySizer?: KellyPositionSizer;
  config?: Partial<OrderbookDepthConfig>;
}

export function createOrderbookDepthRatioTick(deps: OrderbookDepthDeps): () => Promise<void> {
  const { kellySizer, config, ...baseDeps } = deps;
  const strategy = new OrderbookDepthRatioStrategy(baseDeps, config, kellySizer);
  return strategy.toTickFn();
}
