/**
 * Mean Reversion Strategy — V2 implementation.
 *
 * Trades mean-reversion on Polymarket binary option prices.
 * When price deviates significantly from the trailing moving average
 * (measured as a z-score), the strategy enters a position betting
 * on reversion back toward the mean.
 *
 * Entry: |z-score| > spikeThreshold (deviation from mean)
 * Exit: z-score returns near zero or TP/SL/hold limits
 *
 * Keeps the original constructor interface for trading-pipeline.ts
 * compatibility. Price updates arrive via the orderbook stream.
 */

import { logger } from '../../core/logger';
import type { ClobClient } from '../../polymarket/clob-client';
import type { MarketScanner } from '../../polymarket/market-scanner';
import type { StrategyConfig } from '../../core/types';
import { calcMean, calcStdDev } from './strategy-math-helpers';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface MeanReversionConfig {
  /** Size per trade in USDC */
  sizeUsdc: number;
  /** Z-score threshold to trigger entry */
  spikeThreshold: number;
  /** Z-score threshold to exit (must be <= spikeThreshold) */
  exitThreshold: number;
  /** Number of price ticks for moving average */
  maWindow: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** How often to scan (ms) — kept for compat */
  scanIntervalMs: number;
}

const DEFAULT_CONFIG: MeanReversionConfig = {
  sizeUsdc: 50,
  spikeThreshold: 2.0,
  exitThreshold: 0.5,
  maWindow: 20,
  maxPositions: 3,
  scanIntervalMs: 60_000,
};

// ── Tracked position ──────────────────────────────────────────────────────────

interface MrPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  entryZscore: number;
  openedAt: number;
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute z-score of current price relative to rolling window stats. */
export function computeZScore(
  price: number,
  prices: number[],
): number {
  if (prices.length < 3) return 0;
  const mean = calcMean(prices);
  const std = calcStdDev(prices);
  if (std <= 0) return 0;
  return (price - mean) / std;
}

/** Determine trade direction: buy yes if price is below mean (negative z-score), buy no if above. */
export function getMrDirection(zScore: number): 'yes' | 'no' | null {
  if (Math.abs(zScore) < 0.5) return null; // neutral zone
  return zScore < 0 ? 'yes' : 'no';
}

// ── Strategy class (keeps original constructor interface) ─────────────────────

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
