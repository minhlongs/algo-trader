/**
 * Regime Switch Detector V2 — extends BasePolymarketStrategy.
 *
 * Detects statistical regime changes using variance ratio tests.
 * VR ≈ 1 → random walk, VR < 1 → mean-reverting, VR > 1 → trending.
 * Trades the new regime direction when a switch is detected.
 *
 * Switch to trending → follow momentum direction.
 * Switch to mean-reverting → fade last move.
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

export interface RegimeSwitchDetectorConfig extends BaseStrategyConfig {
  shortWindow: number;
  longWindow: number;
  vrEmaAlpha: number;
  trendingThreshold: number;
  meanRevertThreshold: number;
}

export const DEFAULT_CONFIG: RegimeSwitchDetectorConfig = {
  shortWindow: 5,
  longWindow: 20,
  vrEmaAlpha: 0.12,
  trendingThreshold: 1.2,
  meanRevertThreshold: 0.8,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME = 'regime-switch-detector' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcReturns(prices: number[]): number[] {
  if (prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(prices[i] - prices[i - 1]);
  }
  return returns;
}

export function calcVariance(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sumSq = 0;
  for (const v of values) sumSq += (v - mean) ** 2;
  return sumSq / values.length;
}

export function calcVarianceRatio(shortVar: number, longVar: number): number {
  if (longVar === 0) return 0;
  return shortVar / longVar;
}

export function classifyRegime(vr: number, trendThresh: number, meanRevertThresh: number): 'trending' | 'mean-reverting' | 'neutral' {
  if (vr >= trendThresh) return 'trending';
  if (vr <= meanRevertThresh) return 'mean-reverting';
  return 'neutral';
}

export function detectSwitch(prevRegime: string, currentRegime: string): 'to-trending' | 'to-mean-reverting' | null {
  if (prevRegime === currentRegime) return null;
  if (currentRegime === 'trending' && prevRegime !== 'trending') return 'to-trending';
  if (currentRegime === 'mean-reverting' && prevRegime !== 'mean-reverting') return 'to-mean-reverting';
  return null;
}

export function updateEma(prevEma: number | null, newValue: number, alpha: number): number {
  if (prevEma === null) return newValue;
  if (alpha <= 0) return prevEma;
  if (alpha >= 1) return newValue;
  return alpha * newValue + (1 - alpha) * prevEma;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class RegimeSwitchDetectorStrategy extends BasePolymarketStrategy {
  private readonly cfg: RegimeSwitchDetectorConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly vrEmaState = new Map<string, number>();
  private readonly regimeState = new Map<string, string>();

  constructor(deps: StrategyDeps, config: Partial<RegimeSwitchDetectorConfig> = {}) {
    const fullConfig: RegimeSwitchDetectorConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const maxPrices = this.cfg.longWindow + 1;
    if (history.length > maxPrices) {
      history.splice(0, history.length - maxPrices);
    }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
  }

  private momentumDirection(returns: number[]): 'up' | 'down' {
    if (returns.length === 0) return 'up';
    const recent = returns.slice(-this.cfg.shortWindow);
    let sum = 0;
    for (const r of recent) sum += r;
    return sum >= 0 ? 'up' : 'down';
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
        if (prices.length < this.cfg.longWindow + 1) continue;

        const allReturns = calcReturns(prices);
        const shortReturns = allReturns.slice(-this.cfg.shortWindow);
        const longReturns = allReturns.slice(-this.cfg.longWindow);

        const shortVar = calcVariance(shortReturns);
        const longVar = calcVariance(longReturns);
        const vr = calcVarianceRatio(shortVar, longVar);

        const prevVrEma = this.vrEmaState.get(market.yesTokenId) ?? null;
        const vrEma = updateEma(prevVrEma, vr, this.cfg.vrEmaAlpha);
        this.vrEmaState.set(market.yesTokenId, vrEma);

        const currentRegime = classifyRegime(vrEma, this.cfg.trendingThreshold, this.cfg.meanRevertThreshold);
        const prevRegime = this.regimeState.get(market.yesTokenId) ?? 'neutral';
        this.regimeState.set(market.yesTokenId, currentRegime);

        const switchType = detectSwitch(prevRegime, currentRegime);
        if (!switchType) continue;

        const momentum = this.momentumDirection(allReturns);
        const side: 'yes' | 'no' = switchType === 'to-trending'
          ? (momentum === 'up' ? 'yes' : 'no')
          : (momentum === 'up' ? 'no' : 'yes');

        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Regime switch entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4),
          vr: vr.toFixed(4), vrEma: vrEma.toFixed(4),
          regime: currentRegime, switchType, momentum,
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

export interface RegimeSwitchDetectorDeps extends StrategyDeps {
  config?: Partial<RegimeSwitchDetectorConfig>;
}

export function createRegimeSwitchDetectorTick(
  deps: RegimeSwitchDetectorDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new RegimeSwitchDetectorStrategy(baseDeps, config);
  return strategy.toTickFn();
}
