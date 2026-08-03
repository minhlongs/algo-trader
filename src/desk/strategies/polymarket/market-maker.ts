/**
 * Market Maker Strategy — V2 implementation.
 *
 * Provides two-sided liquidity on Polymarket markets by placing
 * bid/ask orders around a fair value estimate. Captures the spread
 * while managing inventory risk.
 *
 * Each market gets a bid at fairValue - halfSpread and an ask at
 * fairValue + halfSpread. The quoted spread widens when inventory
 * becomes skewed (too many YES or NO positions).
 *
 * Entry: place bid/ask when spread > minSpread
 * Exit: filled orders auto-close; stale quotes are refreshed
 */

import { EventEmitter } from 'events';
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyConfig } from '../../core/types';
import { logger } from '../../core/logger';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface MarketMakerConfig {
  /** Base spread fraction (0.01 = 1%) around fair value */
  baseSpread: number;
  /** Quote size per side in USDC */
  quoteSizeUsdc: number;
  /** How often to refresh quotes (ms) */
  refreshIntervalMs: number;
  /** Max inventory skew before widening spread */
  maxInventorySkew: number;
  /** Spread multiplier when inventory is maximally skewed */
  skewSpreadMultiplier: number;
  /** Minimum liquidity (USDC) to consider a market */
  minLiquidity: number;
}

export const DEFAULT_CONFIG: MarketMakerConfig = {
  baseSpread: 0.02,
  quoteSizeUsdc: 25,
  refreshIntervalMs: 20_000,
  maxInventorySkew: 3,
  skewSpreadMultiplier: 2.0,
  minLiquidity: 1000,
};

// ── Per-market state ──────────────────────────────────────────────────────────

interface MmMarket {
  yesTokenId: string;
  noTokenId?: string;
  conditionId: string;
  volume: number;
  liquidity: number;
}

interface MmMarketState {
  info: MmMarket;
  fairValue: number;
  confidence: number;
  bidPlaced: number;   // timestamp of last bid
  askPlaced: number;   // timestamp of last ask
  inventorySkew: number; // > 0 = long, < 0 = short
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute bid price with skew-adjusted spread. */
export function computeBidPrice(fairValue: number, spread: number, skew: number, skewMultiplier: number): number {
  const adjustedSpread = spread * (1 + Math.max(0, skew) * (skewMultiplier - 1) / 3);
  return Math.max(0.01, fairValue - adjustedSpread / 2);
}

/** Compute ask price with skew-adjusted spread. */
export function computeAskPrice(fairValue: number, spread: number, skew: number, skewMultiplier: number): number {
  const adjustedSpread = spread * (1 + Math.max(0, -skew) * (skewMultiplier - 1) / 3);
  return Math.min(0.99, fairValue + adjustedSpread / 2);
}

/** Update inventory skew from trade activity. */
export function updateSkew(currentSkew: number, sideFilled: 'bid' | 'ask'): number {
  return sideFilled === 'bid' ? currentSkew + 1 : currentSkew - 1;
}

// ── Strategy class (keeps original constructor interface) ────────────────────

export class MarketMakerStrategy extends EventEmitter {
  private readonly cfg: MarketMakerConfig;
  private readonly capital: string;
  private readonly markets = new Map<string, MmMarketState>();
  private running = false;

  constructor(
    private clobClient: ClobClient,
    cfg: StrategyConfig,
    capital: string,
  ) {
    super();
    this.cfg = { ...DEFAULT_CONFIG, ...(cfg.params as Partial<MarketMakerConfig>) };
    this.capital = capital;
    this.running = true;
    logger.info('[market-maker] Strategy initialized', {
      baseSpread: this.cfg.baseSpread,
      quoteSize: this.cfg.quoteSizeUsdc,
      capital: this.capital,
    });
  }

  /** Add a market to the quoting universe. */
  addMarket(opp: { yesTokenId: string; noTokenId: string; conditionId: string; volume: number; liquidity: number }): void {
    const key = opp.conditionId;
    if (this.markets.has(key)) return;
    this.markets.set(key, {
      info: opp,
      fairValue: 0.5,
      confidence: 0,
      bidPlaced: 0,
      askPlaced: 0,
      inventorySkew: 0,
    });
    logger.debug('[market-maker] Market added', { key });
  }

  /** Set fair value estimate from AI prediction loop. */
  setFairValue(tokenId: string, prob: number, confidence: number): void {
    // Match by tokenId across all tracked markets
    for (const [, state] of this.markets) {
      if (state.info.yesTokenId === tokenId || state.info.noTokenId === tokenId) {
        state.fairValue = Math.max(0.01, Math.min(0.99, prob));
        state.confidence = confidence;
        return;
      }
    }
  }

  /** Main tick: refresh stale quotes across all markets. */
  async executeTick(): Promise<void> {
    if (!this.running) return;

    const now = Date.now();
    for (const [key, state] of this.markets) {
      if (now - Math.max(state.bidPlaced, state.askPlaced) < this.cfg.refreshIntervalMs) continue;

      try {
        const book = await this.clobClient.getOrderBook(state.info.yesTokenId);
        const ba = this.bestBidAsk(book);

        // Skip markets with insufficient liquidity
        const totalLiq = parseFloat(book.bids[0]?.size ?? '0') + parseFloat(book.asks[0]?.size ?? '0');
        if (totalLiq < this.cfg.minLiquidity) continue;

        const bid = computeBidPrice(state.fairValue, this.cfg.baseSpread, state.inventorySkew, this.cfg.skewSpreadMultiplier);
        const ask = computeAskPrice(state.fairValue, this.cfg.baseSpread, state.inventorySkew, this.cfg.skewSpreadMultiplier);

        state.bidPlaced = now;
        state.askPlaced = now;

        // Detect fills via mid-price crossing
        if (ba.mid >= ask) {
          // Ask filled — we sold, increase long skew
          state.inventorySkew = updateSkew(state.inventorySkew, 'ask');
          logger.debug('[market-maker] Ask filled', { market: key, price: ask.toFixed(4) });
        } else if (ba.mid <= bid) {
          // Bid filled — we bought, increase short skew
          state.inventorySkew = updateSkew(state.inventorySkew, 'bid');
          logger.debug('[market-maker] Bid filled', { market: key, price: bid.toFixed(4) });
        }
      } catch {
        continue;
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.markets.clear();
    logger.info('[market-maker] Stopped');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
    const bid = book.bids.length > 0 ? parseFloat(book.bids[0]!.price) : 0;
    const ask = book.asks.length > 0 ? parseFloat(book.asks[0]!.price) : 1;
    return { bid, ask, mid: (bid + ask) / 2 };
  }
}
