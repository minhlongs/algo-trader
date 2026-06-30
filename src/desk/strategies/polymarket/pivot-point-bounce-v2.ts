/**
 * Pivot Point Bounce V2 — extends BasePolymarketStrategy.
 *
 * Calculates classic pivot points (S1/R1) from rolling HLC and trades
 * bounces off support (BUY YES) or reversals off resistance (BUY NO).
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

export interface PivotPointBounceConfig extends BaseStrategyConfig {
  hlcWindow: number;
  proximityThreshold: number;
  bounceConfirmTicks: number;
}

export const DEFAULT_CONFIG: PivotPointBounceConfig = {
  hlcWindow: 20,
  proximityThreshold: 0.01,
  bounceConfirmTicks: 2,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'pivot-point-bounce' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcPivotPoints(
  high: number,
  low: number,
  close: number,
): { pivot: number; s1: number; r1: number } {
  const pivot = (high + low + close) / 3;
  const s1 = 2 * pivot - high;
  const r1 = 2 * pivot - low;
  return { pivot, s1, r1 };
}

export function isNearLevel(price: number, level: number, threshold: number): boolean {
  return Math.abs(price - level) <= threshold;
}

export function detectBounce(
  prices: number[],
  level: number,
  direction: 'up' | 'down',
  confirmTicks: number,
): boolean {
  if (prices.length < confirmTicks + 1) return false;

  const pivotIndex = prices.length - confirmTicks - 1;
  const pivotPrice = prices[pivotIndex];
  const threshold = Math.max(Math.abs(level) * 0.05, 0.02);
  if (Math.abs(pivotPrice - level) > threshold) return false;

  const tail = prices.slice(prices.length - confirmTicks);
  let prevPrice = prices[prices.length - confirmTicks - 1];

  for (const p of tail) {
    if (direction === 'up' && p < prevPrice) return false;
    if (direction === 'down' && p > prevPrice) return false;
    prevPrice = p;
  }

  const first = prices[prices.length - confirmTicks - 1];
  const last = prices[prices.length - 1];
  if (direction === 'up' && last <= first) return false;
  if (direction === 'down' && last >= first) return false;

  return true;
}

export function findHLC(prices: number[]): { high: number; low: number; close: number } {
  if (prices.length === 0) return { high: 0, low: 0, close: 0 };

  let high = -Infinity;
  let low = Infinity;

  for (const p of prices) {
    if (p > high) high = p;
    if (p < low) low = p;
  }

  return { high, low, close: prices[prices.length - 1] };
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class PivotPointBounceStrategy extends BasePolymarketStrategy {
  private readonly cfg: PivotPointBounceConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<PivotPointBounceConfig> = {}) {
    const fullConfig: PivotPointBounceConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
    history.push(price);
    const maxLen = this.cfg.hlcWindow + this.cfg.bounceConfirmTicks + 1;
    if (history.length > maxLen) {
      history.splice(0, history.length - maxLen);
    }
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

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length < this.cfg.hlcWindow) continue;

        const windowPrices = prices.slice(prices.length - this.cfg.hlcWindow);
        const hlc = findHLC(windowPrices);
        const { s1, r1 } = calcPivotPoints(hlc.high, hlc.low, hlc.close);

        // Support bounce → BUY YES
        if (detectBounce(prices, s1, 'up', this.cfg.bounceConfirmTicks)) {
          await this.enterPosition(market.yesTokenId, market.conditionId, 'yes', ba.ask,
            parseFloat(this.cfg.positionSize));
          logger.debug('S1 bounce entry', this.strategyName, {
            s1: s1.toFixed(4), r1: r1.toFixed(4),
          });
          continue;
        }

        // Resistance reversal → BUY NO
        if (detectBounce(prices, r1, 'down', this.cfg.bounceConfirmTicks)) {
          const tokenId = market.noTokenId ?? market.yesTokenId;
          await this.enterPosition(tokenId, market.conditionId, 'no', 1 - ba.bid,
            parseFloat(this.cfg.positionSize));
          logger.debug('R1 reversal entry', this.strategyName, {
            s1: s1.toFixed(4), r1: r1.toFixed(4),
          });
          continue;
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

export interface PivotPointBounceDeps extends StrategyDeps {
  config?: Partial<PivotPointBounceConfig>;
}

export function createPivotPointBounceTick(deps: PivotPointBounceDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new PivotPointBounceStrategy(baseDeps, config);
  return strategy.toTickFn();
}
