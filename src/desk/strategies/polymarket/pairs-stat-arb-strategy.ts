/**
 * Pairs Statistical Arbitrage Strategy implementation.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  type PairsStatArbConfig,
} from './pairs-stat-arb-types';
import {
  calcSpread,
  calcBollingerBands,
  calcSpreadZScore,
  calcPairCorr,
} from './pairs-stat-arb-math';

export class PairsStatArbStrategy extends BasePolymarketStrategy {
  private readonly cfg: PairsStatArbConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly pairStatus = new Map<string, 'long' | 'short'>();

  constructor(deps: StrategyDeps, config: Partial<PairsStatArbConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let h = this.priceHistory.get(tokenId);
    if (!h) { h = []; this.priceHistory.set(tokenId, h); }
    h.push(price);
    if (h.length > this.cfg.windowSize * 4) h.splice(0, h.length - this.cfg.windowSize * 4);
  }

  private async scanPair(marketA: GammaMarket, marketB: GammaMarket): Promise<void> {
    if (!marketA.yesTokenId || !marketB.yesTokenId) return;
    if (marketA.closed || marketA.resolved || marketB.closed || marketB.resolved) return;
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    try {
      const bookA = await this.deps.clob.getOrderBook(marketA.yesTokenId);
      const bookB = await this.deps.clob.getOrderBook(marketB.yesTokenId);
      const baA = this.bestBidAsk(bookA);
      const baB = this.bestBidAsk(bookB);

      this.recordPrice(marketA.yesTokenId, baA.mid);
      this.recordPrice(marketB.yesTokenId, baB.mid);

      const pricesA = this.priceHistory.get(marketA.yesTokenId) ?? [];
      const pricesB = this.priceHistory.get(marketB.yesTokenId) ?? [];

      if (pricesA.length < this.cfg.windowSize || pricesB.length < this.cfg.windowSize) return;

      // Verify pair correlation
      const corr = calcPairCorr(pricesA, pricesB);
      if (corr < this.cfg.minCorrelation) return;

      // Compute spread Bollinger bands
      const spreads: number[] = [];
      const recent = Math.min(pricesA.length, pricesB.length);
      for (let i = 0; i < recent; i++) {
        spreads.push(calcSpread(pricesA[i]!, pricesB[i]!));
      }

      const currentSpread = calcSpread(baA.mid, baB.mid);
      const bands = calcBollingerBands(spreads, this.cfg.bandWidth);
      const zScore = calcSpreadZScore(currentSpread, spreads);

      if (Math.abs(zScore) > this.cfg.maxZScore) {
        logger.debug('Spread extreme — regime change likely', STRATEGY_NAME, {
          pair: `${marketA.conditionId}:${marketB.conditionId}`, zScore: zScore.toFixed(2),
        });
        return;
      }

      const pairKey = `${marketA.conditionId}:${marketB.conditionId}`;
      const currentSide = this.pairStatus.get(pairKey);

      if (zScore > this.cfg.entryZScore && currentSide !== 'short') {
        // Spread is wide: marketA overpriced relative to marketB
        // Bet on convergence: buy B (cheaper), avoid A
        if (!this.hasPosition(marketB.conditionId) && !this.isOnCooldown(marketB.conditionId)) {
          await this.enterPosition(marketB.yesTokenId, marketB.conditionId, 'yes', baB.ask, this.cfg.baseSizeUsdc);
          this.pairStatus.set(pairKey, 'short');
          logger.debug('Pairs arb entry (short spread)', STRATEGY_NAME, {
            pair: pairKey, zScore: zScore.toFixed(2), spread: currentSpread.toFixed(4),
            side: 'yes', market: marketB.conditionId,
          });
        }
      } else if (zScore < -this.cfg.entryZScore && currentSide !== 'long') {
        // Spread is narrow: marketB overpriced relative to marketA
        if (!this.hasPosition(marketA.conditionId) && !this.isOnCooldown(marketA.conditionId)) {
          await this.enterPosition(marketA.yesTokenId, marketA.conditionId, 'yes', baA.ask, this.cfg.baseSizeUsdc);
          this.pairStatus.set(pairKey, 'long');
          logger.debug('Pairs arb entry (long spread)', STRATEGY_NAME, {
            pair: pairKey, zScore: zScore.toFixed(2), spread: currentSpread.toFixed(4),
            side: 'yes', market: marketA.conditionId,
          });
        }
      }
    } catch (err) {
      logger.debug('Pair scan error', STRATEGY_NAME, { pair: `${marketA.conditionId}:${marketB.conditionId}`, err: String(err) });
    }
  }

  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    try {
      const events = await this.deps.gamma.getEvents(this.cfg.scanLimit);
      for (const event of events) {
        const active = event.markets.filter(m => !m.closed && !m.resolved);
        if (active.length < 2) continue;

        for (let i = 0; i < active.length - 1; i++) {
          for (let j = i + 1; j < active.length; j++) {
            await this.scanPair(active[i]!, active[j]!);
          }
        }
      }
    } catch (err) {
      logger.debug('Events fetch error', STRATEGY_NAME, { err: String(err) });
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(30);
      await this.scanEntries(markets);
      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: this.positions.length,
        trackedPairs: this.pairStatus.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}
