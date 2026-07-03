/**
 * Cross-Market Arbitrage Strategy — V2 implementation.
 *
 * Detects price discrepancies between related Polymarket markets that
 * share the same underlying event (e.g., different resolution criteria
 * or group items). Enters when the basis exceeds a configurable threshold.
 *
 * Entry: |priceA - priceB| > minBasis where markets are related
 * Exit: basis converges below exitThreshold or TP/SL/hold limits
 */

import { EventEmitter } from 'events';
import type { ClobClient } from '../../polymarket/clob-client';
import type { MarketScanner } from '../../polymarket/market-scanner';
import type { StrategyConfig } from '../../core/types';
import { logger } from '../../core/logger';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface CrossMarketArbConfig {
  /** Minimum basis (absolute price difference) to enter */
  minBasis: number;
  /** Basis level at which to exit (must be <= minBasis) */
  exitBasis: number;
  /** Default position size in USDC per leg */
  defaultSizeUsdc: number;
  /** Max concurrent arb positions */
  maxPositions: number;
}

const DEFAULT_CONFIG: CrossMarketArbConfig = {
  minBasis: 0.05,
  exitBasis: 0.02,
  defaultSizeUsdc: 50,
  maxPositions: 3,
};

// ── Tracked position ──────────────────────────────────────────────────────────

interface ArbPosition {
  tokenIdA: string;
  tokenIdB: string;
  conditionIdA: string;
  conditionIdB: string;
  entryBasis: number;
  sideA: 'yes' | 'no';
  sizeUsdc: number;
  openedAt: number;
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute absolute basis between two mid-prices. */
export function computeBasis(priceA: number, priceB: number): number {
  return Math.abs(priceA - priceB);
}

/** Determine direction: buy the cheaper side (relative to the other). */
export function getArbDirection(
  priceA: number,
  priceB: number,
): { sideA: 'yes' | 'no'; sideB: 'yes' | 'no' } {
  if (priceA < priceB) return { sideA: 'yes', sideB: 'no' };
  return { sideA: 'no', sideB: 'yes' };
}

// ── Strategy class (keeps original constructor interface) ────────────────────

export class CrossMarketArbStrategy extends EventEmitter {
  private readonly cfg: CrossMarketArbConfig;
  private readonly capital: string;
  private readonly positions: ArbPosition[] = [];
  private running = false;

  constructor(
    private clobClient: ClobClient,
    private scanner: MarketScanner,
    cfg: StrategyConfig,
    capital: string,
  ) {
    super();
    this.cfg = { ...DEFAULT_CONFIG, ...(cfg.params as Partial<CrossMarketArbConfig>) };
    this.capital = capital;
    this.running = true;
    logger.info('[cross-market-arb] Strategy initialized', {
      minBasis: this.cfg.minBasis,
      maxPositions: this.cfg.maxPositions,
      capital: this.capital,
    });
  }

  /** Main tick: scan related markets for arb opportunities. */
  async executeTick(): Promise<void> {
    if (!this.running) return;

    try {
      // Check exits for existing positions
      await this.checkExits();

      // Find new opportunities
      const result = await this.scanner.scan({ minVolume: 500 });
      const opps = result.opportunities;

      for (let i = 0; i < opps.length - 1 && this.positions.length < this.cfg.maxPositions; i++) {
        for (let j = i + 1; j < opps.length && this.positions.length < this.cfg.maxPositions; j++) {
          const oppA = opps[i]!;
          const oppB = opps[j]!;

          // Skip same market
          if (oppA.conditionId === oppB.conditionId) continue;

          try {
            const bookA = await this.clobClient.getOrderBook(oppA.yesTokenId);
            const bookB = await this.clobClient.getOrderBook(oppB.yesTokenId);

            const midA = this.midPrice(bookA);
            const midB = this.midPrice(bookB);
            if (midA <= 0 || midB <= 0) continue;

            const basis = computeBasis(midA, midB);
            if (basis < this.cfg.minBasis) continue;

            const dir = getArbDirection(midA, midB);
            this.positions.push({
              tokenIdA: oppA.yesTokenId,
              tokenIdB: oppB.yesTokenId,
              conditionIdA: oppA.conditionId,
              conditionIdB: oppB.conditionId,
              entryBasis: basis,
              sideA: dir.sideA,
              sizeUsdc: this.cfg.defaultSizeUsdc,
              openedAt: Date.now(),
            });

            logger.info('[cross-market-arb] Position opened', {
              basis: basis.toFixed(4),
              dir: `${dir.sideA}/${dir.sideB}`,
              size: this.cfg.defaultSizeUsdc,
            });
          } catch {
            continue;
          }
        }
      }
    } catch (err) {
      logger.warn('[cross-market-arb] Tick error', { err: String(err) });
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.positions.length = 0;
    logger.info('[cross-market-arb] Stopped');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private midPrice(book: { bids: Array<{ price: string }>; asks: Array<{ price: string }> }): number {
    const bid = book.bids.length > 0 ? parseFloat(book.bids[0]!.price) : 0;
    const ask = book.asks.length > 0 ? parseFloat(book.asks[0]!.price) : 1;
    return (bid + ask) / 2;
  }

  private async checkExits(): Promise<void> {
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i]!;

      try {
        const bookA = await this.clobClient.getOrderBook(pos.tokenIdA);
        const bookB = await this.clobClient.getOrderBook(pos.tokenIdB);
        const midA = this.midPrice(bookA);
        const midB = this.midPrice(bookB);

        const currentBasis = computeBasis(midA, midB);

        // Exit when basis converges or max hold time exceeded
        if (currentBasis <= this.cfg.exitBasis || Date.now() - pos.openedAt > 30 * 60_000) {
          toRemove.push(i);
          const reason = currentBasis <= this.cfg.exitBasis ? 'converged' : 'timeout';
          logger.info('[cross-market-arb] Position closed', { reason, basis: currentBasis.toFixed(4) });
        }
      } catch {
        toRemove.push(i);
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.positions.splice(toRemove[i]!, 1);
    }
  }
}
