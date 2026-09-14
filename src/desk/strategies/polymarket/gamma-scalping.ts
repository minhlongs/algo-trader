import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import { BasePolymarketStrategy, type StrategyDeps } from './base-polymarket-strategy';
import { type GammaScalpingConfig, DEFAULT_CONFIG, STRATEGY_NAME } from './gamma-scalping-types';
import {
  calcImpliedVol,
  calcTimeToExpiry,
  estimateBinaryGamma,
  calcHedgeDirection,
} from './gamma-scalping-math';

export * from './gamma-scalping-types';
export * from './gamma-scalping-math';

export class GammaScalpingStrategy extends BasePolymarketStrategy {
  private readonly cfg: GammaScalpingConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<GammaScalpingConfig> = {}) {
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
    if (h.length > this.cfg.volWindow * 4) h.splice(0, h.length - this.cfg.volWindow * 4);
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

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length < 5) continue;

        const sigma = calcImpliedVol(prices);
        const tte = calcTimeToExpiry(market.endDate);
        const gamma = estimateBinaryGamma(ba.mid, sigma, tte);

        const baselineGamma = estimateBinaryGamma(0.5, sigma, tte);
        const gammaRatio = baselineGamma > 0 ? gamma / baselineGamma : 0;

        if (gammaRatio < this.cfg.gammaThreshold) continue;

        const side = calcHedgeDirection(ba.mid, gamma);
        if (!side) continue;
        if (side === 'no' && !market.noTokenId) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : 1 - ba.bid;

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

        logger.debug('Gamma scalping entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          gamma: gamma.toFixed(4),
          gammaRatio: gammaRatio.toFixed(2),
          vol: (sigma * 100).toFixed(1),
          tte: tte.toFixed(2),
          price: ba.mid.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, { market: market.conditionId, err: String(err) });
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
        trackedMarkets: this.priceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

export function createGammaScalpingTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new GammaScalpingStrategy(deps);
  return strategy.toTickFn();
}
