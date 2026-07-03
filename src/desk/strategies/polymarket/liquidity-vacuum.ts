/**
 * Liquidity Vacuum Strategy — V2 implementation.
 *
 * Identifies markets where liquidity has suddenly evaporated (a "vacuum")
 * and trades the subsequent volatility reversion. A vacuum is detected
 * when total order book depth drops significantly relative to its
 * trailing average.
 *
 * Entry: depth drops below depthThreshold of trailing average
 * Exit: depth recovers above recoveryThreshold or TP/SL/maxHold
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface LiquidityVacuumConfig extends BaseStrategyConfig {
  /** Depth ratio threshold to detect vacuum (e.g., 0.3 = 30% of avg) */
  vacuumThreshold: number;
  /** Depth ratio threshold to recover and exit (e.g., 0.7 = 70% of avg) */
  recoveryThreshold: number;
  /** Number of ticks for trailing depth average */
  depthLookback: number;
  /** Minimum vacuum depth (USDC) to consider valid */
  minVacuumDepth: number;
}

export const DEFAULT_CONFIG: LiquidityVacuumConfig = {
  vacuumThreshold: 0.3,
  recoveryThreshold: 0.7,
  depthLookback: 10,
  minVacuumDepth: 100,
  minVolume: 2000,
  takeProfitPct: 0.035,
  stopLossPct: 0.02,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

const STRATEGY_NAME: StrategyName = 'liquidity-vacuum';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute total order book depth (bid + ask volume in USDC). */
export function computeTotalDepth(book: RawOrderBook): number {
  const bidDepth = book.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const askDepth = book.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  return bidDepth + askDepth;
}

/** Ratio of current depth to trailing average. Returns 1 if no history. */
export function computeDepthRatio(currentDepth: number, history: number[]): number {
  if (history.length === 0) return 1;
  const avgDepth = history.reduce((s, v) => s + v, 0) / history.length;
  return avgDepth > 0 ? currentDepth / avgDepth : 1;
}

/** Entry direction: bet against the side that lost liquidity. */
export function getVacuumDirection(book: RawOrderBook): 'yes' | 'no' | null {
  const bidDepth = book.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const askDepth = book.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  const total = bidDepth + askDepth;
  if (total <= 0) return null;
  const askRatio = askDepth / total;
  // If asks dominate, bid side is under-priced -> buy yes
  // If bids dominate, ask side is over-priced -> buy no
  if (askRatio > 0.7) return 'yes';
  if (askRatio < 0.3) return 'no';
  return null;
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class LiquidityVacuumStrategy extends BasePolymarketStrategy {
  private readonly cfg: LiquidityVacuumConfig;
  private readonly depthHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<LiquidityVacuumConfig> = {}) {
    const fullConfig: LiquidityVacuumConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: depth recovered ───────────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
  ): { exit: boolean; reason: string } {
    const hist = this.depthHistory.get(pos.tokenId);
    if (!hist || hist.length < 3) return { exit: false, reason: '' };
    const currentDepth = hist[hist.length - 1]!;
    const ratio = computeDepthRatio(currentDepth, hist.slice(0, -1));
    if (ratio >= this.cfg.recoveryThreshold) {
      return { exit: true, reason: `depth-recovered (${(ratio * 100).toFixed(0)}%)` };
    }
    return { exit: false, reason: '' };
  }

  // ── Entry scanning ─────────────────────────────────────────────────────

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

        const depth = computeTotalDepth(book);

        // Track depth history
        let hist = this.depthHistory.get(market.yesTokenId);
        if (!hist) {
          hist = [];
          this.depthHistory.set(market.yesTokenId, hist);
        }
        hist.push(depth);
        if (hist.length > this.cfg.depthLookback * 3) hist.splice(0, hist.length - this.cfg.depthLookback * 3);

        if (hist.length < this.cfg.depthLookback) continue;

        const ratio = computeDepthRatio(depth, hist.slice(0, -1));
        if (ratio > this.cfg.vacuumThreshold) continue;
        if (depth < this.cfg.minVacuumDepth) continue;

        const dir = getVacuumDirection(book);
        if (!dir) continue;

        const tokenId = dir === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = dir === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          dir,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Vacuum entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: dir,
          depthRatio: ratio.toFixed(2),
          depth: depth.toFixed(0),
        });
      } catch (err) {
        logger.debug('Vacuum scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createLiquidityVacuumTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new LiquidityVacuumStrategy(deps);
  return strategy.toTickFn();
}
