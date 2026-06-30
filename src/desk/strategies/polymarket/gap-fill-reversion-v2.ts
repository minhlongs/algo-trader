/**
 * Gap Fill Reversion V2 — extends BasePolymarketStrategy.
 *
 * Detects price gaps (sudden jumps) and trades the expectation that gaps
 * fill — price reverts toward the pre-gap level.
 *
 * Signal: up gap → BUY NO, down gap → BUY YES.
 * Requires gap persist for confirmTicks before entry.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface GapFillReversionConfig extends BaseStrategyConfig {
  gapThreshold: number;
  confirmTicks: number;
  gapDecayMs: number;
}

export const DEFAULT_CONFIG: GapFillReversionConfig = {
  gapThreshold: 0.03,
  confirmTicks: 2,
  gapDecayMs: 300_000,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'gap-fill-reversion' as StrategyName;

// ── Internal types ───────────────────────────────────────────────────────────

export interface GapRecord {
  direction: 'up' | 'down';
  size: number;
  preGapPrice: number;
  gapPrice: number;
  timestamp: number;
  confirmCount: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function detectGap(
  prevPrice: number,
  currentPrice: number,
  threshold: number,
): { isGap: boolean; direction: 'up' | 'down'; size: number } {
  const size = Math.abs(currentPrice - prevPrice);
  const direction: 'up' | 'down' = currentPrice > prevPrice ? 'up' : 'down';
  return { isGap: size > threshold, direction, size };
}

export function isGapConfirmed(
  gapDirection: 'up' | 'down',
  gapPrice: number,
  currentPrice: number,
  confirmCount: number,
  requiredConfirms: number,
): boolean {
  if (confirmCount < requiredConfirms) return false;
  if (gapDirection === 'up') return currentPrice >= gapPrice;
  return currentPrice <= gapPrice;
}

export function isGapStale(gapTimestamp: number, now: number, decayMs: number): boolean {
  return now - gapTimestamp > decayMs;
}

export function calcFillTarget(
  preGapPrice: number,
  gapPrice: number,
  fillPct: number = 0.5,
): number {
  return preGapPrice + fillPct * (gapPrice - preGapPrice);
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class GapFillReversionStrategy extends BasePolymarketStrategy {
  private readonly cfg: GapFillReversionConfig;
  private readonly lastPrices = new Map<string, number>();
  private readonly activeGaps = new Map<string, GapRecord>();

  constructor(deps: StrategyDeps, config: Partial<GapFillReversionConfig> = {}) {
    const fullConfig: GapFillReversionConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

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

        const prevPrice = this.lastPrices.get(market.yesTokenId);
        this.lastPrices.set(market.yesTokenId, ba.mid);
        if (prevPrice === undefined) continue;

        const now = Date.now();
        const existingGap = this.activeGaps.get(market.yesTokenId);

        if (existingGap) {
          if (isGapStale(existingGap.timestamp, now, this.cfg.gapDecayMs)) {
            this.activeGaps.delete(market.yesTokenId);
            continue;
          }

          if (existingGap.direction === 'up' && ba.mid >= existingGap.gapPrice) {
            existingGap.confirmCount++;
          } else if (existingGap.direction === 'down' && ba.mid <= existingGap.gapPrice) {
            existingGap.confirmCount++;
          } else {
            this.activeGaps.delete(market.yesTokenId);
            continue;
          }

          if (!isGapConfirmed(existingGap.direction, existingGap.gapPrice, ba.mid,
            existingGap.confirmCount, this.cfg.confirmTicks)) {
            continue;
          }

          const side: 'yes' | 'no' = existingGap.direction === 'down' ? 'yes' : 'no';
          const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
          const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

          await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
            parseFloat(this.cfg.positionSize));

          logger.debug('Gap fill entry', this.strategyName, {
            gapDirection: existingGap.direction,
            gapSize: existingGap.size.toFixed(4),
            preGapPrice: existingGap.preGapPrice.toFixed(4),
            fillTarget: calcFillTarget(existingGap.preGapPrice, existingGap.gapPrice).toFixed(4),
          });

          this.activeGaps.delete(market.yesTokenId);
        } else {
          const gap = detectGap(prevPrice, ba.mid, this.cfg.gapThreshold);
          if (gap.isGap) {
            this.activeGaps.set(market.yesTokenId, {
              direction: gap.direction,
              size: gap.size,
              preGapPrice: prevPrice,
              gapPrice: ba.mid,
              timestamp: now,
              confirmCount: 0,
            });
          }
        }
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface GapFillReversionDeps extends StrategyDeps {
  config?: Partial<GapFillReversionConfig>;
}

export function createGapFillReversionTick(deps: GapFillReversionDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new GapFillReversionStrategy(baseDeps, config);
  return strategy.toTickFn();
}
