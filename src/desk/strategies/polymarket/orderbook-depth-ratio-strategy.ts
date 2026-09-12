/**
 * Orderbook Depth Ratio Strategy Implementation
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type OrderbookDepthConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './orderbook-depth-ratio-types';
import { calcDepthRatio, calcDepthZScore, detectMomentum } from './orderbook-depth-ratio-math';

export class OrderbookDepthRatioStrategy extends BasePolymarketStrategy {
  private readonly cfg: OrderbookDepthConfig;
  private readonly kellySizer?: KellyPositionSizer;
  private readonly depthHistory = new Map<string, number[]>();
  private readonly priceHistory = new Map<string, number[]>();

  constructor(
    deps: StrategyDeps,
    config: Partial<OrderbookDepthConfig> = {},
    kellySizer?: KellyPositionSizer
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
    return history ? history.slice(-this.cfg.lookbackPeriods) : [];
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
  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number
  ): { exit: boolean; reason: string } {
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
      if (this.hasPosition(market.conditionId) || this.isOnCooldown(market.conditionId)) continue;

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

  private async refreshDepthForOpenPositions(): Promise<void> {
    for (const pos of this.positions) {
      try {
        const book = await this.deps.clob.getOrderBook(pos.tokenId);
        const ratio = calcDepthRatio(book, this.cfg.depthLevels);
        this.recordDepthRatio(pos.tokenId, ratio);
      } catch { /* skip failed fetches */ }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.refreshDepthForOpenPositions();
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
