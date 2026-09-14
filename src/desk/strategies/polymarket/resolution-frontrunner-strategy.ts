/**
 * Resolution Frontrunner Strategy Implementation.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type ResolutionFrontrunnerConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './resolution-frontrunner-types';
import {
  isNearResolution,
  detectConvergenceSignal,
  hasMomentum,
} from './resolution-frontrunner-math';

export class ResolutionFrontrunnerStrategy extends BasePolymarketStrategy {
  private readonly cfg: ResolutionFrontrunnerConfig;
  private readonly getTime: () => number;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(
    deps: StrategyDeps,
    config: Partial<ResolutionFrontrunnerConfig> = {},
    clock?: () => number,
  ) {
    const fullConfig: ResolutionFrontrunnerConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.getTime = clock ?? (() => Date.now());
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const maxLen = this.cfg.momentumTicks * 3;
    if (history.length > maxLen) {
      history.splice(0, history.length - maxLen);
    }
  }

  private getPriceWindow(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
  }

  /** Check if any open positions are on resolved markets — exit them. */
  private async checkResolvedExits(markets: GammaMarket[]): Promise<void> {
    const toRemove: number[] = [];
    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const market = markets.find(m => m.conditionId === pos.conditionId);
      if (market?.resolved) {
        try {
          const book = await this.deps.clob.getOrderBook(pos.tokenId);
          const currentPrice = this.bestBidAsk(book).mid;
          await this.exitPosition(pos, currentPrice, 'market resolved');
          toRemove.push(i);
        } catch { /* skip */ }
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.positions.splice(toRemove[i], 1);
    }
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;
    const now = this.getTime();

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume24h ?? 0) < this.cfg.minVolume24h) continue;
      if (!isNearResolution(market.endDate, this.cfg.resolutionWindowMs, now)) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);

        const signal = detectConvergenceSignal(ba.mid, this.cfg.highThreshold, this.cfg.lowThreshold);
        if (!signal) continue;

        const history = this.getPriceWindow(market.yesTokenId);
        const direction = signal === 'buy-yes' ? 'up' : 'down';
        if (!hasMomentum(history, direction, this.cfg.momentumTicks)) continue;

        const side: 'yes' | 'no' = signal === 'buy-yes' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Resolution frontrunner entry', this.strategyName, {
          conditionId: market.conditionId, side, signal,
          entryPrice: entryPrice.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }

  /** Override execute() — adds resolved-market check, uses volume24h filter. */
  async execute(): Promise<void> {
    try {
      const markets = await this.deps.gamma.getTrending(50);
      await this.checkExits();
      await this.checkResolvedExits(markets);
      await this.scanEntries(markets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}
