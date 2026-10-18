/**
 * Vol Compression Breakout Strategy Class
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type VolCompressionConfig,
  type CompressionEntry,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './vol-compression-types';
import {
  calcRealizedVol,
  calcATR,
  detectCompression,
  detectBreakout,
  appendBoundedPrice,
  hasVolumeConfirmation,
  isFailedBreakoutReversal,
} from './vol-compression-math';

export class VolCompressionBreakoutStrategy extends BasePolymarketStrategy {
  private readonly cfg: VolCompressionConfig;
  private readonly kellySizer?: KellyPositionSizer;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly compressionState = new Map<string, CompressionEntry>();
  /** Tracks the mid price at entry for failed-breakout exit detection. */
  private readonly compressionMids = new Map<string, number>();

  constructor(
    deps: StrategyDeps,
    config: Partial<VolCompressionConfig> = {},
    kellySizer?: KellyPositionSizer,
  ) {
    const fullConfig: VolCompressionConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.kellySizer = kellySizer;
  }

  private recordTick(tokenId: string, price: number): void {
    appendBoundedPrice(this.priceHistory, tokenId, price, this.cfg.longVolWindow * 3);
  }

  private getPrices(tokenId: string, count: number): number[] {
    return (this.priceHistory.get(tokenId) ?? []).slice(-count);
  }

  private getSize(): number {
    return this.kellySizer?.getSize(STRATEGY_NAME).size ?? parseFloat(this.cfg.positionSize);
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

        const shortPrices = this.getPrices(market.yesTokenId, this.cfg.shortVolWindow);
        const longPrices = this.getPrices(market.yesTokenId, this.cfg.longVolWindow);
        if (shortPrices.length < this.cfg.shortVolWindow || longPrices.length < this.cfg.longVolWindow) continue;

        const volShort = calcRealizedVol(shortPrices);
        const volLong = calcRealizedVol(longPrices);
        const isCompressed = detectCompression(volShort, volLong, this.cfg.compressionThreshold);
        const state = this.compressionState.get(market.yesTokenId);

        if (isCompressed && (!state || !state.compressed)) {
          this.compressionState.set(market.yesTokenId, { compressed: true, compressedAt: Date.now() });
          continue; // wait for breakout
        }

        if (!isCompressed && state?.compressed) {
          const atr = calcATR(this.getPrices(market.yesTokenId, this.cfg.atrPeriod + 1), this.cfg.atrPeriod);
          const breakoutDir = detectBreakout(shortPrices, atr, this.cfg.breakoutMultiplier);

          this.compressionState.set(market.yesTokenId, { compressed: false, compressedAt: 0 });
          if (!breakoutDir || !hasVolumeConfirmation(market.volume24h, market.volume)) continue;

          const side: 'yes' | 'no' = breakoutDir === 'up' ? 'yes' : 'no';
          const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
          const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

          await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.getSize());
          this.compressionMids.set(market.conditionId, ba.mid);

          logger.debug('Vol compression entry', this.strategyName, {
            conditionId: market.conditionId, side,
            entryPrice: entryPrice.toFixed(4),
            volRatio: (volShort / volLong).toFixed(4), breakoutDir,
          });
        }
      } catch (err) {
        logger.debug('Scan error', this.strategyName, { market: market.conditionId, err: String(err) });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      await this.checkFailedBreakoutExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
        compressedMarkets: Array.from(this.compressionState.values()).filter(s => s.compressed).length,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }

  /** Check for failed breakout: price reversed back into compression range within 2 min of entry. */
  private async checkFailedBreakoutExits(): Promise<void> {
    const toRemove: number[] = [];
    const now = Date.now();

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const compressionMid = this.compressionMids.get(pos.conditionId);
      if (compressionMid === undefined || (now - pos.openedAt) >= 2 * 60_000) continue;

      try {
        const book = await this.deps.clob.getOrderBook(pos.tokenId);
        const currentPrice = this.bestBidAsk(book).mid;
        if (isFailedBreakoutReversal(pos.side, currentPrice, compressionMid, pos.openedAt, now)) {
          await this.exitPosition(pos, currentPrice, 'failed breakout (reversed into compression range)');
          toRemove.push(i);
        }
      } catch { /* skip */ }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.compressionMids.delete(this.positions[toRemove[i]].conditionId);
      this.positions.splice(toRemove[i], 1);
    }
  }
}
