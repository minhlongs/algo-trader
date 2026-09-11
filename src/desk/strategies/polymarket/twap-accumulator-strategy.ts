/**
 * TWAP Accumulator Strategy implementation.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  type TwapAccumulatorConfig,
  type AccumulatorState,
} from './twap-accumulator-types';
import {
  computeAverageEntryPrice,
  isSliceDue,
  getAccumulationDirection,
} from './twap-accumulator-math';

export class TwapAccumulatorStrategy extends BasePolymarketStrategy {
  private readonly cfg: TwapAccumulatorConfig;
  private readonly accumulators = new Map<string, AccumulatorState>();
  private lastCleanup = Date.now();

  constructor(deps: StrategyDeps, config: Partial<TwapAccumulatorConfig> = {}) {
    const fullConfig: TwapAccumulatorConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: all slices filled or TP/SL ────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
  ): { exit: boolean; reason: string } {
    const acc = Array.from(this.accumulators.values())
      .find(a => a.conditionId === pos.conditionId);
    if (!acc) return { exit: false, reason: '' };

    if (acc.slicesFilled >= acc.totalSlices) {
      return { exit: true, reason: 'all-slices-filled' };
    }
    return { exit: false, reason: '' };
  }

  // ── Entry scanning ─────────────────────────────────────────────────────

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    // Cleanup stale accumulators
    this.cleanupStaleAccumulators();

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minMarketVolume) continue;

      const existingAcc = this.accumulators.get(market.conditionId);
      if (existingAcc) {
        // Continue accumulating existing position
        await this.processSlice(existingAcc);
        continue;
      }

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        const dir = getAccumulationDirection(ba.mid, this.cfg.maxSlippage * 2);
        if (!dir) continue;

        const tokenId = dir === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = dir === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        // Start a new accumulator
        const sliceSize = this.cfg.targetSizeUsdc / this.cfg.numSlices;
        const acc: AccumulatorState = {
          marketId: tokenId,
          conditionId: market.conditionId,
          yesTokenId: market.yesTokenId,
          noTokenId: market.noTokenId,
          direction: dir,
          targetSize: this.cfg.targetSizeUsdc,
          sliceSize,
          slicesFilled: 0,
          totalSlices: this.cfg.numSlices,
          lastSliceAt: 0,
          entryPrices: [],
          side: dir,
        };
        this.accumulators.set(market.conditionId, acc);

        // Execute first slice immediately
        await this.processSlice(acc);
      } catch (err) {
        logger.debug('TWAP scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }

  private async processSlice(acc: AccumulatorState): Promise<void> {
    if (!isSliceDue(acc.lastSliceAt, this.cfg.sliceIntervalMs)) return;
    if (acc.slicesFilled >= acc.totalSlices) return;

    const sliceSize = acc.targetSize / acc.totalSlices;
    const side = acc.direction;

    try {
      const book = await this.deps.clob.getOrderBook(acc.yesTokenId);
      const ba = this.bestBidAsk(book);
      if (ba.mid <= 0 || ba.mid >= 1) return;

      const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

      // Check slippage against first entry price
      if (acc.entryPrices.length > 0) {
        const avgPrice = computeAverageEntryPrice(acc.entryPrices);
        const slippage = Math.abs(entryPrice - avgPrice) / avgPrice;
        if (slippage > this.cfg.maxSlippage) {
          logger.debug('TWAP slice skipped — slippage too high', STRATEGY_NAME, {
            slippage: (slippage * 100).toFixed(2),
          });
          return;
        }
      }

      await this.enterPosition(
        acc.yesTokenId,
        acc.conditionId,
        side,
        entryPrice,
        sliceSize,
      );

      acc.slicesFilled++;
      acc.entryPrices.push(entryPrice);
      acc.lastSliceAt = Date.now();

      logger.debug('TWAP slice executed', STRATEGY_NAME, {
        conditionId: acc.conditionId,
        slice: `${acc.slicesFilled}/${acc.totalSlices}`,
        price: entryPrice.toFixed(4),
        size: sliceSize.toFixed(2),
      });
    } catch (err) {
      logger.debug('TWAP slice error', STRATEGY_NAME, {
        conditionId: acc.conditionId,
        err: String(err),
      });
    }
  }

  private cleanupStaleAccumulators(): void {
    const now = Date.now();
    if (now - this.lastCleanup < 60_000) return;
    this.lastCleanup = now;

    for (const [key, acc] of this.accumulators) {
      if (acc.slicesFilled >= acc.totalSlices) {
        this.accumulators.delete(key);
      }
    }
  }
}
