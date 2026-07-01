/**
 * Liquidity Migration V2 — extends BasePolymarketStrategy.
 *
 * Detects when liquidity migrates from one side of the book to the other.
 * When market makers pull asks and add bids (or vice versa), it signals
 * directional conviction. Trades in the direction liquidity migrates toward.
 *
 * Bids growing, asks shrinking → BUY YES (bullish).
 * Asks growing, bids shrinking → BUY NO (bearish).
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

export interface LiquidityMigrationConfig extends BaseStrategyConfig {
  depthWindow: number;
  migrationThreshold: number;
  smoothingAlpha: number;
}

export const DEFAULT_CONFIG: LiquidityMigrationConfig = {
  depthWindow: 10,
  migrationThreshold: 0.15,
  smoothingAlpha: 0.12,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'liquidity-migration' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcDepthChangeRate(depthHistory: number[]): number {
  if (depthHistory.length < 2) return 0;
  const first = depthHistory[0];
  if (first === 0) return 0;
  const last = depthHistory[depthHistory.length - 1];
  return (last - first) / first;
}

export function calcMigrationScore(bidChangeRate: number, askChangeRate: number): number {
  return bidChangeRate - askChangeRate;
}

export function smoothMigration(prevSmoothed: number | null, current: number, alpha: number): number {
  if (prevSmoothed === null) return current;
  if (alpha <= 0) return prevSmoothed;
  if (alpha >= 1) return current;
  return alpha * current + (1 - alpha) * prevSmoothed;
}

export function isMigrationSignal(score: number, threshold: number): boolean {
  return Math.abs(score) > threshold;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class LiquidityMigrationStrategy extends BasePolymarketStrategy {
  private readonly cfg: LiquidityMigrationConfig;
  private readonly bidDepthHistory = new Map<string, number[]>();
  private readonly askDepthHistory = new Map<string, number[]>();
  private readonly smoothedScores = new Map<string, number>();

  constructor(deps: StrategyDeps, config: Partial<LiquidityMigrationConfig> = {}) {
    const fullConfig: LiquidityMigrationConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordDepth(tokenId: string, bidDepth: number, askDepth: number): void {
    let bidHist = this.bidDepthHistory.get(tokenId);
    if (!bidHist) { bidHist = []; this.bidDepthHistory.set(tokenId, bidHist); }
    bidHist.push(bidDepth);
    if (bidHist.length > this.cfg.depthWindow) {
      bidHist.splice(0, bidHist.length - this.cfg.depthWindow);
    }

    let askHist = this.askDepthHistory.get(tokenId);
    if (!askHist) { askHist = []; this.askDepthHistory.set(tokenId, askHist); }
    askHist.push(askDepth);
    if (askHist.length > this.cfg.depthWindow) {
      askHist.splice(0, askHist.length - this.cfg.depthWindow);
    }
  }

  private totalDepth(levels: { price: string; size: string }[]): number {
    let total = 0;
    for (const level of levels) total += parseFloat(level.size);
    return total;
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

        const bidDepth = this.totalDepth(book.bids);
        const askDepth = this.totalDepth(book.asks);
        this.recordDepth(market.yesTokenId, bidDepth, askDepth);

        const bidHistory = this.bidDepthHistory.get(market.yesTokenId) ?? [];
        const askHistory = this.askDepthHistory.get(market.yesTokenId) ?? [];
        if (bidHistory.length < 2) continue;

        const bidChangeRate = calcDepthChangeRate(bidHistory);
        const askChangeRate = calcDepthChangeRate(askHistory);
        const rawScore = calcMigrationScore(bidChangeRate, askChangeRate);

        const prevSmoothed = this.smoothedScores.get(market.yesTokenId) ?? null;
        const smoothed = smoothMigration(prevSmoothed, rawScore, this.cfg.smoothingAlpha);
        this.smoothedScores.set(market.yesTokenId, smoothed);

        if (!isMigrationSignal(smoothed, this.cfg.migrationThreshold)) continue;

        // Positive migration (bids growing, asks shrinking) → BUY YES
        const side: 'yes' | 'no' = smoothed > 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Liquidity migration entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4),
          migrationScore: smoothed.toFixed(4),
          bidChangeRate: bidChangeRate.toFixed(4),
          askChangeRate: askChangeRate.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface LiquidityMigrationDeps extends StrategyDeps {
  config?: Partial<LiquidityMigrationConfig>;
}

export function createLiquidityMigrationTick(deps: LiquidityMigrationDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new LiquidityMigrationStrategy(baseDeps, config);
  return strategy.toTickFn();
}
