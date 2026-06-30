/**
 * Volatility Targeting V2 — extends BasePolymarketStrategy.
 *
 * Dynamically adjusts position sizing based on realized volatility to maintain
 * constant risk exposure. Low volatility → larger positions.
 * High volatility → reduced size. Uses simple momentum signal for direction.
 *
 * momentum > threshold → BUY YES. momentum < -threshold → BUY NO.
 * Position size = baseSize * min(targetVol / realizedVol, maxScaling).
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

export interface VolatilityTargetingConfig extends BaseStrategyConfig {
  targetVol: number;
  volWindow: number;
  maxScaling: number;
  momentumWindow: number;
  momentumThreshold: number;
}

export const DEFAULT_CONFIG: VolatilityTargetingConfig = {
  targetVol: 0.02,
  volWindow: 20,
  maxScaling: 3.0,
  momentumWindow: 10,
  momentumThreshold: 0.01,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'volatility-targeting' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcRealizedVol(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] === 0) continue;
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  if (returns.length === 0) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

export function calcVolRatio(targetVol: number, realizedVol: number, maxScaling: number): number {
  if (realizedVol === 0) return 1.0;
  const ratio = targetVol / realizedVol;
  return Math.min(Math.max(ratio, 0), maxScaling);
}

export function calcMomentum(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  return (prices[prices.length - 1] - first) / first;
}

export function adjustPositionSize(baseSize: number, volRatio: number): number {
  return baseSize * volRatio;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class VolatilityTargetingStrategy extends BasePolymarketStrategy {
  private readonly cfg: VolatilityTargetingConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<VolatilityTargetingConfig> = {}) {
    const fullConfig: VolatilityTargetingConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const maxLen = Math.max(this.cfg.volWindow, this.cfg.momentumWindow) + 1;
    if (history.length > maxLen) { history.splice(0, history.length - maxLen); }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
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
        const prices = this.getPrices(market.yesTokenId);
        if (prices.length < 2) continue;

        const realizedVol = calcRealizedVol(prices.slice(-this.cfg.volWindow));
        const momentum = calcMomentum(prices.slice(-this.cfg.momentumWindow));
        if (Math.abs(momentum) < this.cfg.momentumThreshold) continue;

        const volRatio = calcVolRatio(this.cfg.targetVol, realizedVol, this.cfg.maxScaling);
        const side: 'yes' | 'no' = momentum > 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        const posSize = adjustPositionSize(parseFloat(this.cfg.positionSize), volRatio);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, posSize);

        logger.debug('Vol-targeting entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4),
          momentum: momentum.toFixed(4), realizedVol: realizedVol.toFixed(4),
          volRatio: volRatio.toFixed(4), size: posSize.toFixed(2),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, { market: market.conditionId, err: String(err) });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface VolatilityTargetingDeps extends StrategyDeps {
  config?: Partial<VolatilityTargetingConfig>;
}

export function createVolatilityTargetingTick(
  deps: VolatilityTargetingDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new VolatilityTargetingStrategy(baseDeps, config);
  return strategy.toTickFn();
}
