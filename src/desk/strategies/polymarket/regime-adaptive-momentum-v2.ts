/**
 * Regime-Adaptive Momentum V2 — extends BasePolymarketStrategy.
 *
 * Adapts momentum trading based on market regime (trending, ranging, volatile).
 * Different entry signals and take-profit levels per regime.
 * Custom exit: regime-shift + trend reversal against position.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import { BasePolymarketStrategy, type StrategyDeps } from './base-polymarket-strategy';
import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  type Regime,
  type RegimeAdaptiveMomentumConfig,
  type RegimeAdaptiveMomentumDeps,
} from './regime-adaptive-momentum-types';
import {
  detectRegime,
  calcPullbackDepth,
  calcOBI,
  calcTrendDirection,
  RegimePriceTracker,
} from './regime-adaptive-momentum-math';
import {
  evaluateRegimeExit,
  evaluateRegimeEntrySignal,
  resolveRegimeEntryOrderParams,
  cleanupExitedRegimePositions,
} from './regime-adaptive-momentum-evaluators';
import { createRegimeAdaptiveMomentumTick } from './regime-adaptive-momentum-factory';

export type {
  RegimeAdaptiveMomentumConfig,
  RegimeAdaptiveMomentumDeps,
  Regime,
};

export {
  DEFAULT_CONFIG,
  detectRegime,
  calcPullbackDepth,
  calcOBI,
  calcTrendDirection,
  createRegimeAdaptiveMomentumTick,
};

export class RegimeAdaptiveMomentumStrategy extends BasePolymarketStrategy {
  private readonly cfg: RegimeAdaptiveMomentumConfig;
  private readonly tracker = new RegimePriceTracker();
  private readonly entryRegimes = new Map<string, Regime>();
  private readonly entryTrendDirs = new Map<string, 'up' | 'down'>();

  constructor(deps: StrategyDeps, config: Partial<RegimeAdaptiveMomentumConfig> = {}) {
    const fullConfig: RegimeAdaptiveMomentumConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordTick(tokenId: string, price: number): void {
    this.tracker.recordTick(tokenId, price, this.cfg.longWindow * 3);
  }

  private getPrices(tokenId: string, count: number): number[] {
    return this.tracker.getPrices(tokenId, count);
  }

  /** Override: regime-dependent TP + regime-shift exit. */
  protected async checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      let currentPrice: number;

      try {
        const book = await this.deps.clob.getOrderBook(pos.tokenId);
        currentPrice = this.bestBidAsk(book).mid;
        this.recordTick(pos.tokenId, currentPrice);
      } catch {
        continue;
      }

      const entryRegime = this.entryRegimes.get(pos.conditionId) ?? 'ranging';
      const shortP = this.getPrices(pos.tokenId, this.cfg.shortWindow);
      const longP = this.getPrices(pos.tokenId, this.cfg.longWindow);
      const { shouldExit, reason } = evaluateRegimeExit(
        pos, currentPrice, now, entryRegime, shortP, longP, this.cfg
      );

      if (shouldExit) {
        await this.exitPosition(pos, currentPrice, reason);
        toRemove.push(i);
      }
    }

    cleanupExitedRegimePositions(toRemove, this.positions, this.entryRegimes, this.entryTrendDirs);
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

        this.recordTick(market.yesTokenId, ba.mid);
        const shortPrices = this.getPrices(market.yesTokenId, this.cfg.shortWindow);
        const longPrices = this.getPrices(market.yesTokenId, this.cfg.longWindow);
        if (shortPrices.length < this.cfg.shortWindow || longPrices.length < this.cfg.longWindow) continue;

        const signal = evaluateRegimeEntrySignal(shortPrices, longPrices, ba.mid, book, this.cfg);
        if (!signal) continue;

        const orderParams = resolveRegimeEntryOrderParams(market, ba, signal, this.cfg.baseSizeUsdc);
        if (!orderParams) continue;

        await this.enterPosition(
          orderParams.tokenId, market.conditionId, signal.side, orderParams.entryPrice, orderParams.posSize
        );
        this.entryRegimes.set(market.conditionId, signal.regime);
        this.entryTrendDirs.set(market.conditionId, signal.trendDir);

        logger.debug('Regime-adaptive entry', this.strategyName, {
          conditionId: market.conditionId, side: signal.side, regime: signal.regime,
          trendDir: signal.trendDir, entryPrice: orderParams.entryPrice.toFixed(4),
          size: orderParams.posSize.toFixed(2),
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
        openPositions: this.positions.length, trackedMarkets: this.tracker.size,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}
