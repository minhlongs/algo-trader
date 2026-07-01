/**
 * Mean-Variance Optimizer V2 — extends BasePolymarketStrategy.
 *
 * Applies simplified Markowitz mean-variance optimization to select the best
 * risk-adjusted market to trade per tick. Estimates expected return and variance
 * from rolling price snapshots, then picks the market with the highest
 * |Sharpe-like ratio| above threshold.
 *
 * ratio > 0 → BUY YES (positive expected return). ratio < 0 → BUY NO.
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

export interface MeanVarianceOptimizerConfig extends BaseStrategyConfig {
  returnWindow: number;
  varianceWindow: number;
  minSharpeRatio: number;
}

export const DEFAULT_CONFIG: MeanVarianceOptimizerConfig = {
  returnWindow: 15,
  varianceWindow: 20,
  minSharpeRatio: 1.5,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

const STRATEGY_NAME = 'mean-variance-optimizer' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcExpectedReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  return (prices[prices.length - 1] - first) / first;
}

export function calcVariance(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] === 0) { returns.push(0); }
    else { returns.push((prices[i] - prices[i - 1]) / prices[i - 1]); }
  }
  if (returns.length === 0) return 0;
  let sum = 0;
  for (const r of returns) sum += r;
  const mean = sum / returns.length;
  let sqSum = 0;
  for (const r of returns) sqSum += (r - mean) ** 2;
  return sqSum / returns.length;
}

export function calcSharpeRatio(expectedReturn: number, variance: number): number {
  if (variance <= 0) return 0;
  return expectedReturn / Math.sqrt(variance);
}

export function selectBestMarket(
  candidates: { id: string; ratio: number }[],
  minRatio: number,
): { id: string; ratio: number } | null {
  let best: { id: string; ratio: number } | null = null;
  let bestAbs = 0;
  for (const c of candidates) {
    const absRatio = Math.abs(c.ratio);
    if (absRatio >= minRatio && absRatio > bestAbs) { best = c; bestAbs = absRatio; }
  }
  return best;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class MeanVarianceOptimizerStrategy extends BasePolymarketStrategy {
  private readonly cfg: MeanVarianceOptimizerConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<MeanVarianceOptimizerConfig> = {}) {
    const fullConfig: MeanVarianceOptimizerConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const maxWindow = Math.max(this.cfg.returnWindow, this.cfg.varianceWindow);
    if (history.length > maxWindow) { history.splice(0, history.length - maxWindow); }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    interface Candidate {
      id: string; ratio: number; market: GammaMarket;
      entryPrice: number; side: 'yes' | 'no'; tokenId: string;
    }
    const candidates: Candidate[] = [];

    for (const market of markets) {
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.getPrices(market.yesTokenId);
        if (prices.length < 2) continue;

        const expectedReturn = calcExpectedReturn(prices.slice(-this.cfg.returnWindow));
        const variance = calcVariance(prices.slice(-this.cfg.varianceWindow));
        const ratio = calcSharpeRatio(expectedReturn, variance);
        if (Math.abs(ratio) < this.cfg.minSharpeRatio) continue;

        const side: 'yes' | 'no' = ratio > 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        candidates.push({ id: market.conditionId, ratio, market, entryPrice, side, tokenId });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, { market: market.conditionId, err: String(err) });
      }
    }

    const best = selectBestMarket(
      candidates.map(c => ({ id: c.id, ratio: c.ratio })),
      this.cfg.minSharpeRatio,
    );
    if (!best) return;

    const selected = candidates.find(c => c.id === best.id);
    if (!selected) return;

    await this.enterPosition(
      selected.tokenId, selected.market.conditionId, selected.side, selected.entryPrice,
      parseFloat(this.cfg.positionSize),
    );

    logger.debug('Mean-variance entry', this.strategyName, {
      conditionId: selected.market.conditionId, side: selected.side,
      entryPrice: selected.entryPrice.toFixed(4), sharpeRatio: selected.ratio.toFixed(4),
    });
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface MeanVarianceOptimizerDeps extends StrategyDeps {
  config?: Partial<MeanVarianceOptimizerConfig>;
}

export function createMeanVarianceOptimizerTick(
  deps: MeanVarianceOptimizerDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new MeanVarianceOptimizerStrategy(baseDeps, config);
  return strategy.toTickFn();
}
