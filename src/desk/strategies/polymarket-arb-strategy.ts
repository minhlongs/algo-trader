/**
 * Polymarket Arbitrage Strategy — V2 implementation.
 *
 * Scans for cross-market price discrepancies on Polymarket and executes
 * arbitrage trades when spread exceeds configurable threshold.
 *
 * Two arbitrage modes:
 *   1. Yes/No spread — BUY YES + BUY NO when combined price < 1
 *   2. Cross-market — Same event traded on different markets
 *
 * Extends BasePolymarketStrategy for position management, TP/SL exits,
 * cooldowns, and event emission.
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import type { StrategyName } from '../core/types';
import { logger } from '../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './polymarket/base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface PolymarketArbConfig extends BaseStrategyConfig {
  /** Minimum arbitrage spread to execute (e.g., 0.02 = 2%) */
  minSpread: number;
  /** Lookback ticks to compute average spread */
  spreadLookback: number;
  /** Max capital per arbitrage leg in USDC */
  maxLegSize: number;
  /** Only trade when combined YES + NO < this threshold */
  maxCombinedPrice: number;
}

export const DEFAULT_CONFIG: PolymarketArbConfig = {
  minSpread: 0.02,
  spreadLookback: 5,
  maxLegSize: 50,
  maxCombinedPrice: 0.98,
  minVolume: 2000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 60_000,
  positionSize: '25',
};

const STRATEGY_NAME = 'polymarket-arb' as StrategyName;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Detect a YES/NO arbitrage: combined price < 1 means synthetic 1 can be
 * constructed for less than face value.
 * Returns the spread as a positive fraction if profitable, 0 otherwise.
 */
export function detectYesNoArb(yesPrice: number, noPrice: number): number {
  const combined = yesPrice + noPrice;
  if (combined >= 1) return 0;
  return 1 - combined;
}

/**
 * Detect cross-market price discrepancy between two related markets.
 * For markets that should track the same event, returns absolute |priceA - priceB|.
 */
export function detectCrossMarketArb(priceA: number, priceB: number): number {
  return Math.abs(priceA - priceB);
}

/**
 * Track spread history and compute average.
 */
export function updateSpreadHistory(history: Map<string, number[]>, key: string, spread: number, lookback: number): number {
  let arr = history.get(key);
  if (!arr) {
    arr = [];
    history.set(key, arr);
  }
  arr.push(spread);
  if (arr.length > lookback) {
    arr.splice(0, arr.length - lookback);
  }
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class PolymarketArbStrategy extends BasePolymarketStrategy {
  private readonly cfg: PolymarketArbConfig;
  private readonly spreadHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<PolymarketArbConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || !market.noTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        // Fetch both YES and NO order books
        const [yesBook, noBook] = await Promise.all([
          this.deps.clob.getOrderBook(market.yesTokenId),
          this.deps.clob.getOrderBook(market.noTokenId),
        ]);

        const yesBA = this.bestBidAsk(yesBook);
        const noBA = this.bestBidAsk(noBook);

        if (yesBA.mid <= 0 || noBA.mid <= 0) continue;
        if (yesBA.mid >= 1 || noBA.mid >= 1) continue;

        // Check YES/NO arbitrage: combined price < 1
        const spread = detectYesNoArb(yesBA.mid, noBA.mid);
        if (spread <= 0) continue;

        // Check spread stability
        const avgSpread = updateSpreadHistory(
          this.spreadHistory,
          market.conditionId,
          spread,
          this.cfg.spreadLookback,
        );

        if (avgSpread < this.cfg.minSpread) continue;

        // Combined YES + NO price check
        const combinedPrice = yesBA.mid + noBA.mid;
        if (combinedPrice >= this.cfg.maxCombinedPrice) continue;

        // Execute: BUY YES at the ask, BUY NO at the ask (synthetic 1)
        // We enter a balanced position: buy both sides proportionally
        const legSize = Math.min(this.cfg.maxLegSize, parseFloat(this.cfg.positionSize));
        const yesEntryPrice = yesBA.ask;
        const noEntryPrice = noBA.ask;

        // Enter YES position
        await this.enterPosition(
          market.yesTokenId,
          market.conditionId,
          'yes',
          yesEntryPrice,
          legSize,
        );

        // Enter NO position
        await this.enterPosition(
          market.noTokenId,
          market.conditionId,
          'no',
          noEntryPrice,
          legSize,
        );

        logger.info('Arbitrage entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          yesPrice: yesEntryPrice.toFixed(4),
          noPrice: noEntryPrice.toFixed(4),
          combined: combinedPrice.toFixed(4),
          spread: spread.toFixed(4),
          avgSpread: avgSpread.toFixed(4),
        });

        this.setCooldown(market.conditionId);
      } catch (err) {
        logger.debug('Arb scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createPolymarketArbTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new PolymarketArbStrategy(deps);
  return strategy.toTickFn();
}
