/**
 * Mean Reversion Strategy Implementation.
 */

import { logger } from '../../core/logger';
import type { ClobClient } from '../../polymarket/clob-client';
import type { MarketScanner } from '../../polymarket/market-scanner';
import type { StrategyConfig } from '../../core/types';
import {
  type MeanReversionConfig,
  type MrPosition,
  DEFAULT_CONFIG,
} from './mean-reversion-types';
import { computeZScore, getMrDirection } from './mean-reversion-math';

export class MeanReversionStrategy {
  private readonly cfg: MeanReversionConfig;
  private readonly capital: string;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly positions: MrPosition[] = [];
  private running = false;

  constructor(
    private clobClient: ClobClient,
    private scanner: MarketScanner,
    cfg: StrategyConfig,
    capital: string,
  ) {
    this.cfg = { ...DEFAULT_CONFIG, ...(cfg.params as Partial<MeanReversionConfig>) };
    this.capital = capital;
    this.running = true;
    logger.info('[mean-reversion] Strategy initialized', {
      spikeThreshold: this.cfg.spikeThreshold,
      maWindow: this.cfg.maWindow,
      maxPositions: this.cfg.maxPositions,
      capital: this.capital,
    });
  }

  /** Called by orderbook stream on each price update. */
  onPriceUpdate(tokenId: string, price: number): void {
    if (!this.running) return;
    if (price <= 0 || price >= 1) return;

    // Record price
    let hist = this.priceHistory.get(tokenId);
    if (!hist) {
      hist = [];
      this.priceHistory.set(tokenId, hist);
    }
    hist.push(price);
    if (hist.length > this.cfg.maWindow * 3) {
      hist.splice(0, hist.length - this.cfg.maWindow * 3);
    }

    // Check if we already have a position on this token
    if (this.positions.some(p => p.tokenId === tokenId)) return;
    if (this.positions.length >= this.cfg.maxPositions) return;
    if (hist.length < this.cfg.maWindow) return;

    const zScore = computeZScore(price, hist.slice(-this.cfg.maWindow));
    const dir = getMrDirection(zScore);
    if (!dir) return;

    // Check ABSOLUTE z-score threshold
    if (Math.abs(zScore) < this.cfg.spikeThreshold) return;

    this.positions.push({
      tokenId,
      conditionId: tokenId, // token-level tracking
      side: dir,
      entryPrice: price,
      sizeUsdc: this.cfg.sizeUsdc,
      entryZscore: zScore,
      openedAt: Date.now(),
    });

    logger.info('[mean-reversion] Position opened', {
      tokenId: tokenId.slice(0, 10),
      side: dir,
      entryPrice: price.toFixed(4),
      zScore: zScore.toFixed(2),
    });
  }

  /** Main tick: check exit conditions for all positions. */
  async executeTick(): Promise<void> {
    if (!this.running) return;

    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i]!;
      let shouldExit = false;
      let reason = '';

      const hist = this.priceHistory.get(pos.tokenId);
      if (!hist || hist.length < 3) continue;

      const currentPrice = hist[hist.length - 1]!;
      const zScore = computeZScore(currentPrice, hist.slice(-this.cfg.maWindow));

      // Exit conditions: z-score back near zero, or timeout
      if (Math.abs(zScore) <= this.cfg.exitThreshold) {
        shouldExit = true;
        reason = 'reverted';
      } else if (now - pos.openedAt > 30 * 60_000) {
        shouldExit = true;
        reason = 'timeout';
      }

      if (shouldExit) {
        toRemove.push(i);
        logger.info('[mean-reversion] Position closed', {
          tokenId: pos.tokenId.slice(0, 10),
          side: pos.side,
          entryPrice: pos.entryPrice.toFixed(4),
          exitPrice: currentPrice.toFixed(4),
          zScore: zScore.toFixed(2),
          reason,
        });
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.positions.splice(toRemove[i]!, 1);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.positions.length = 0;
    this.priceHistory.clear();
    logger.info('[mean-reversion] Stopped');
  }
}
