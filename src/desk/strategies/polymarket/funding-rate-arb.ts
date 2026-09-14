/**
 * Funding Rate Arbitrage Strategy — V2 implementation.
 *
 * Estimates an implied funding rate from the order book dynamics on
 * Polymarket and compares it to a rolling distribution. When the rate
 * reaches an extreme percentile the strategy enters in the opposite
 * direction (high funding = expensive side, fade the premium).
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type FundingRateArbConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './funding-rate-arb-types';
import {
  estimateImpliedFundingRate,
  annualizeFundingRate,
  calcPercentile,
  calcFundingRateZScore,
} from './funding-rate-arb-math';

export * from './funding-rate-arb-types';
export * from './funding-rate-arb-math';

export class FundingRateArbStrategy extends BasePolymarketStrategy {
  private readonly cfg: FundingRateArbConfig;
  /** History of implied funding rate per market */
  private readonly fundingHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<FundingRateArbConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if (market.volume < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        const rawRate = estimateImpliedFundingRate(book);
        const annualized = annualizeFundingRate(rawRate);

        let hist = this.fundingHistory.get(market.yesTokenId);
        if (!hist) {
          hist = [];
          this.fundingHistory.set(market.yesTokenId, hist);
        }
        hist.push(annualized);
        if (hist.length > this.cfg.windowSize * 3) {
          hist.splice(0, hist.length - this.cfg.windowSize * 3);
        }

        if (hist.length < this.cfg.windowSize) continue;

        const zScore = calcFundingRateZScore(annualized, hist);
        const percentile = calcPercentile(Math.abs(annualized), hist.map(Math.abs));

        let side: 'yes' | 'no' | null = null;

        // If funding is extremely positive — longs are crowded, fade yes
        if (percentile > this.cfg.extremePercentile) {
          // Trading the opposite direction of the funding skew
          side = rawRate > 0 ? 'no' : 'yes';
        }

        if (!side) continue;
        if (side === 'no' && !market.noTokenId) continue;

        // Only enter when Z-score confirms extreme
        if (zScore < 1.5) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

        logger.debug('Funding rate arb entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          annualizedRate: (annualized * 100).toFixed(2),
          zScore: zScore.toFixed(2),
          percentile: (percentile * 100).toFixed(0),
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: this.positions.length,
        trackedMarkets: this.fundingHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

export function createFundingRateArbTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new FundingRateArbStrategy(deps);
  return strategy.toTickFn();
}
