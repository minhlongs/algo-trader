import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  calcATR,
  calcVelocity,
  calcVolumeRate,
  DEFAULT_CONFIG,
  detectExhaustion,
  type MomentumExhaustionConfig,
} from './momentum-exhaustion-helpers';

const STRATEGY_NAME: StrategyName = 'momentum-exhaustion';

export class MomentumExhaustionStrategy extends BasePolymarketStrategy {
  private readonly cfg: MomentumExhaustionConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly volumeHistory = new Map<string, number[]>();
  private readonly prevVelocity = new Map<string, number>();

  constructor(deps: StrategyDeps, config: Partial<MomentumExhaustionConfig> = {}) {
    const fullConfig: MomentumExhaustionConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordTick(tokenId: string, price: number, volume: number): void {
    let prices = this.priceHistory.get(tokenId);
    if (!prices) {
      prices = [];
      this.priceHistory.set(tokenId, prices);
    }
    prices.push(price);

    let vols = this.volumeHistory.get(tokenId);
    if (!vols) {
      vols = [];
      this.volumeHistory.set(tokenId, vols);
    }
    vols.push(volume);

    const maxLen = Math.max(this.cfg.velocityWindow, this.cfg.atrPeriod) * 4;
    if (prices.length > maxLen) prices.splice(0, prices.length - maxLen);
    if (vols.length > maxLen) vols.splice(0, vols.length - maxLen);
  }

  // -----------------------------------------------------------------------
  // Custom exit
  // -----------------------------------------------------------------------

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
  ): { exit: boolean; reason: string } {
    const prices = this.priceHistory.get(pos.tokenId);
    const vols = this.volumeHistory.get(pos.tokenId);
    if (!prices || !vols || prices.length < this.cfg.velocityWindow + 1) {
      return { exit: false, reason: '' };
    }

    // 2x ATR stop
    const atr = calcATR(prices, this.cfg.atrPeriod);
    if (atr > 0) {
      const priceMove = Math.abs(currentPrice - pos.entryPrice);
      if (priceMove > atr * this.cfg.atrStopMultiplier) {
        return {
          exit: true,
          reason: `atr-stop (${(priceMove / atr).toFixed(2)}x ATR)`,
        };
      }
    }

    // Opposite exhaustion signal
    const priceVel = calcVelocity(prices, this.cfg.velocityWindow);
    const prevVel = this.prevVelocity.get(pos.tokenId) ?? priceVel;
    const volumeRate = calcVolumeRate(vols, this.cfg.velocityWindow);
    const signal = detectExhaustion(priceVel, prevVel, volumeRate);
    if (signal !== null && signal !== pos.side) {
      return { exit: true, reason: `opposite-exhaustion (signal=${signal})` };
    }

    return { exit: false, reason: '' };
  }

  // -----------------------------------------------------------------------
  // Entry scanning
  // -----------------------------------------------------------------------

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

        this.recordTick(market.yesTokenId, ba.mid, market.volume);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        const vols = this.volumeHistory.get(market.yesTokenId) ?? [];

        // Need at least velocityWindow + 2 ticks to compare prev vs current velocity
        if (prices.length < this.cfg.velocityWindow + 2) continue;

        const priceVel = calcVelocity(prices, this.cfg.velocityWindow);

        // Velocity from one tick earlier
        const prevPrices = prices.slice(0, -1);
        const prevPriceVel = prevPrices.length >= this.cfg.velocityWindow + 1
          ? calcVelocity(prevPrices, this.cfg.velocityWindow)
          : priceVel;

        const volumeRate = calcVolumeRate(vols, this.cfg.velocityWindow);

        const signal = detectExhaustion(priceVel, prevPriceVel, volumeRate);
        if (!signal) continue;

        // Store the current velocity for future exit checks
        this.prevVelocity.set(market.yesTokenId, priceVel);

        const side: 'yes' | 'no' = signal;
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

        logger.debug('Exhaustion entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          priceVel: priceVel.toFixed(6),
          volumeRate: volumeRate.toFixed(4),
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
