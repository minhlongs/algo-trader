/**
 * Correlation Breakdown Strategy — Strategy implementation and legacy factory.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type CorrelationBreakdownConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './correlation-breakdown-types';
import { calcPearsonR, calcCorrZScore } from './correlation-breakdown-math';

export class CorrelationBreakdownStrategy extends BasePolymarketStrategy {
  private readonly cfg: CorrelationBreakdownConfig;
  /** Price history per tokenId */
  private readonly priceHistory = new Map<string, number[]>();
  /** Correlation history per pair key "tokenA:tokenB" */
  private readonly corrHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<CorrelationBreakdownConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let h = this.priceHistory.get(tokenId);
    if (!h) {
      h = [];
      this.priceHistory.set(tokenId, h);
    }
    h.push(price);
    if (h.length > this.cfg.windowSize * 3) h.splice(0, h.length - this.cfg.windowSize * 3);
  }

  private getReturns(tokenId: string): number[] {
    const prices = this.priceHistory.get(tokenId);
    if (!prices || prices.length < 3) return [];
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1]! > 0) rets.push((prices[i]! - prices[i - 1]!) / prices[i - 1]!);
    }
    return rets;
  }

  private async scanPair(marketA: GammaMarket, marketB: GammaMarket): Promise<void> {
    if (!marketA.yesTokenId || !marketB.yesTokenId) return;
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    try {
      const bookA = await this.deps.clob.getOrderBook(marketA.yesTokenId);
      const bookB = await this.deps.clob.getOrderBook(marketB.yesTokenId);
      const baA = this.bestBidAsk(bookA);
      const baB = this.bestBidAsk(bookB);

      this.recordPrice(marketA.yesTokenId, baA.mid);
      this.recordPrice(marketB.yesTokenId, baB.mid);

      const retA = this.getReturns(marketA.yesTokenId);
      const retB = this.getReturns(marketB.yesTokenId);

      if (retA.length < this.cfg.windowSize || retB.length < this.cfg.windowSize) return;

      const ra = retA.slice(-this.cfg.windowSize);
      const rb = retB.slice(-this.cfg.windowSize);
      const currentCorr = calcPearsonR(ra, rb);

      const pairKey = `${marketA.conditionId}:${marketB.conditionId}`;
      let hist = this.corrHistory.get(pairKey);
      if (!hist) {
        hist = [];
        this.corrHistory.set(pairKey, hist);
      }
      hist.push(currentCorr);
      if (hist.length > 40) hist.splice(0, hist.length - 40);

      if (hist.length < 5) return;
      const zScore = calcCorrZScore(currentCorr, hist);

      // Only trade breakdowns for pairs that were historically correlated
      const meanCorr = hist.reduce((s, v) => s + v, 0) / hist.length;
      if (meanCorr < this.cfg.minCorrelation) return;

      if (zScore > this.cfg.zScoreThreshold) {
        const expected = (baA.mid + baB.mid) / 2;
        if (baA.mid < expected && !this.hasPosition(marketA.conditionId) && marketA.yesTokenId) {
          await this.enterPosition(marketA.yesTokenId, marketA.conditionId, 'yes', baA.ask, this.cfg.baseSizeUsdc);
          logger.debug('Correlation breakdown entry', STRATEGY_NAME, {
            pair: pairKey, zScore: zScore.toFixed(2), corr: currentCorr.toFixed(3),
            side: 'yes', market: marketA.conditionId,
          });
        } else if (baB.mid < expected && !this.hasPosition(marketB.conditionId) && marketB.yesTokenId) {
          await this.enterPosition(marketB.yesTokenId, marketB.conditionId, 'yes', baB.ask, this.cfg.baseSizeUsdc);
          logger.debug('Correlation breakdown entry', STRATEGY_NAME, {
            pair: pairKey, zScore: zScore.toFixed(2), corr: currentCorr.toFixed(3),
            side: 'yes', market: marketB.conditionId,
          });
        }
      }
    } catch (err) {
      logger.debug('Pair scan error', STRATEGY_NAME, { pair: `${marketA.conditionId}:${marketB.conditionId}`, err: String(err) });
    }
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    try {
      const events = await this.deps.gamma.getEvents(this.cfg.scanLimit);
      for (const event of events) {
        if (event.markets.length < 2) continue;
        const active = event.markets.filter(m => !m.closed && !m.resolved && m.yesTokenId);
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

    for (const market of markets) {
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(30);
      await this.scanEntries(markets);
      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: this.positions.length,
        trackedPairs: this.corrHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

export function createCorrelationBreakdownTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new CorrelationBreakdownStrategy(deps);
  return strategy.toTickFn();
}
