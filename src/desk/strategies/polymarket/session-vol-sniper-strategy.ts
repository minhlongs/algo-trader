/**
 * Session Volatility Sniper Strategy Implementation
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type SessionVolSniperConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './session-vol-sniper-types';
import {
  calcATR,
  calcAverage,
  detectSpike,
  detectMeanReversion,
} from './session-vol-sniper-math';

export class SessionVolSniperStrategy extends BasePolymarketStrategy {
  private readonly cfg: SessionVolSniperConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<SessionVolSniperConfig> = {}) {
    const fullConfig: SessionVolSniperConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordTick(tokenId: string, price: number): void {
    let prices = this.priceHistory.get(tokenId);
    if (!prices) {
      prices = [];
      this.priceHistory.set(tokenId, prices);
    }
    prices.push(price);
    const maxLen = this.cfg.longAtrWindow * 4;
    if (prices.length > maxLen) prices.splice(0, prices.length - maxLen);
  }

  /** Compute average ATR across a range of window sizes to get a stable baseline. */
  private calcAvgAtr(prices: number[]): number {
    const atrs: number[] = [];
    for (let w = this.cfg.shortAtrWindow; w <= this.cfg.longAtrWindow; w++) {
      const atr = calcATR(prices, w);
      if (atr > 0) atrs.push(atr);
    }
    return calcAverage(atrs);
  }

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
  ): { exit: boolean; reason: string } {
    const prices = this.priceHistory.get(pos.tokenId);
    if (!prices || prices.length < this.cfg.longAtrWindow + 1) {
      return { exit: false, reason: '' };
    }

    // Volatility mean-reversion: short ATR drops to or below the long average
    const shortAtr = calcATR(prices, this.cfg.shortAtrWindow);
    const longAvgAtr = this.calcAvgAtr(prices);
    if (detectMeanReversion(shortAtr, longAvgAtr)) {
      return {
        exit: true,
        reason: `vol-mean-reversion (short=${shortAtr.toFixed(4)}, avg=${longAvgAtr.toFixed(4)})`,
      };
    }

    // Time-stop: end of session
    const elapsed = Date.now() - pos.openedAt;
    if (elapsed >= this.cfg.sessionDurationMs) {
      return { exit: true, reason: 'session-time-stop' };
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

        this.recordTick(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length < this.cfg.minTicks) continue;

        const shortAtr = calcATR(prices, this.cfg.shortAtrWindow);
        const longAvgAtr = this.calcAvgAtr(prices);

        if (!detectSpike(shortAtr, longAvgAtr, this.cfg.spikeMultiplier)) continue;

        // Determine direction from recent price movement relative to the short window start
        const shortSlice = prices.slice(-this.cfg.shortAtrWindow);
        const direction = shortSlice[shortSlice.length - 1] >= shortSlice[0] ? 'yes' : 'no';

        const side: 'yes' | 'no' = direction;
        const tokenId = side === 'yes'
          ? market.yesTokenId
          : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          side,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Vol spike entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          shortAtr: shortAtr.toFixed(4),
          longAvgAtr: longAvgAtr.toFixed(4),
          spikeRatio: (shortAtr / longAvgAtr).toFixed(2),
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

export function createSessionVolSniperTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new SessionVolSniperStrategy(deps);
  return strategy.toTickFn();
}
