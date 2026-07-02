/**
 * Regime-Adaptive Momentum V2 — extends BasePolymarketStrategy.
 *
 * Adapts momentum trading based on market regime (trending, ranging, volatile).
 * Different entry signals and take-profit levels per regime.
 * Custom exit: regime-shift + trend reversal against position.
 *
 * Trending: momentum pullback (bottom 30% of range, above SMA_long) → BUY
 * Ranging:  mean reversion via OBI (order book imbalance)          → BUY
 * Volatile: strict pullback (trendStrength > 2.0, bottom 20%)      → BUY
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import { calcSMA, calcATR } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface RegimeAdaptiveMomentumConfig extends BaseStrategyConfig {
  shortWindow: number;
  longWindow: number;
  trendThreshold: number;
  volatileAtrRatio: number;
  trendingPullbackPct: number;
  volatilePullbackPct: number;
  obiEntryThreshold: number;
  baseSizeUsdc: number;
  trendingTpPct: number;
  rangingTpPct: number;
  volatileTpPct: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: RegimeAdaptiveMomentumConfig = {
  shortWindow: 10,
  longWindow: 30,
  trendThreshold: 1.5,
  volatileAtrRatio: 2.0,
  trendingPullbackPct: 0.30,
  volatilePullbackPct: 0.20,
  obiEntryThreshold: 2.0,
  baseSizeUsdc: 25,
  trendingTpPct: 0.05,
  rangingTpPct: 0.03,
  volatileTpPct: 0.025,
  scanLimit: 15,
  minVolume: 0,
  takeProfitPct: 0.025, // lowest regime TP — base class check uses this floor
  stopLossPct: 0.02,
  maxHoldMs: 8 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '25',
};

const STRATEGY_NAME: StrategyName = 'regime-adaptive-momentum';

type Regime = 'trending' | 'ranging' | 'volatile';

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function detectRegime(
  shortPrices: number[],
  longPrices: number[],
  trendThreshold = 1.5,
  volatileAtrRatio = 2.0,
): Regime {
  if (shortPrices.length < 2 || longPrices.length < 2) return 'ranging';
  const smaShort = calcSMA(shortPrices);
  const smaLong = calcSMA(longPrices);
  const atrLong = calcATR(longPrices);
  const atrShort = calcATR(shortPrices);
  if (atrLong <= 0) return 'ranging';
  const trendStrength = Math.abs(smaShort - smaLong) / atrLong;
  if (trendStrength > trendThreshold) return 'trending';
  if (atrShort / atrLong > volatileAtrRatio) return 'volatile';
  return 'ranging';
}

export function calcPullbackDepth(prices: number[], current: number): number {
  if (prices.length === 0) return 0.5;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === min) return 0.5;
  return (current - min) / (max - min);
}

export function calcOBI(book: RawOrderBook): number {
  let bidVol = 0, askVol = 0;
  for (const b of book.bids) bidVol += parseFloat(b.size);
  for (const a of book.asks) askVol += parseFloat(a.size);
  if (askVol <= 0 || bidVol <= 0) return 1.0;
  return bidVol / askVol;
}

export function calcTrendDirection(shortSMA: number, longSMA: number): 'up' | 'down' {
  return shortSMA >= longSMA ? 'up' : 'down';
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class RegimeAdaptiveMomentumStrategy extends BasePolymarketStrategy {
  private readonly cfg: RegimeAdaptiveMomentumConfig;
  private readonly priceHistory = new Map<string, number[]>();
  /** Tracks regime and trend direction at entry for custom exits. */
  private readonly entryRegimes = new Map<string, Regime>();
  private readonly entryTrendDirs = new Map<string, 'up' | 'down'>();

  constructor(deps: StrategyDeps, config: Partial<RegimeAdaptiveMomentumConfig> = {}) {
    const fullConfig: RegimeAdaptiveMomentumConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordTick(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    const max = this.cfg.longWindow * 3;
    if (history.length > max) history.splice(0, history.length - max);
  }

  private getPrices(tokenId: string, count: number): number[] {
    return (this.priceHistory.get(tokenId) ?? []).slice(-count);
  }

  private getTpPct(regime: Regime): number {
    if (regime === 'trending') return this.cfg.trendingTpPct;
    if (regime === 'volatile') return this.cfg.volatileTpPct;
    return this.cfg.rangingTpPct;
  }

  private getSizeMultiplier(regime: Regime): number {
    if (regime === 'trending') return 1.2;
    if (regime === 'volatile') return 0.5;
    return 0.9;
  }

  /** Override: regime-dependent TP + regime-shift exit. */
  protected async checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      let shouldExit = false;
      let reason = '';
      let currentPrice: number;

      try {
        const book = await this.deps.clob.getOrderBook(pos.tokenId);
        currentPrice = this.bestBidAsk(book).mid;
        this.recordTick(pos.tokenId, currentPrice);
      } catch { continue; }

      const gain = pos.side === 'yes'
        ? (currentPrice - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - currentPrice) / pos.entryPrice;

      const regimeTp = this.getTpPct(this.entryRegimes.get(pos.conditionId) ?? 'ranging');

      if (gain >= regimeTp) {
        shouldExit = true;
        reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
      } else if (-gain >= this.cfg.stopLossPct) {
        shouldExit = true;
        reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
      } else if (now - pos.openedAt > this.cfg.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      // Regime shift exit: regime changed AND trend reversed against position
      if (!shouldExit) {
        const shortP = this.getPrices(pos.tokenId, this.cfg.shortWindow);
        const longP = this.getPrices(pos.tokenId, this.cfg.longWindow);
        if (shortP.length >= 2 && longP.length >= 2) {
          const currentRegime = detectRegime(shortP, longP, this.cfg.trendThreshold, this.cfg.volatileAtrRatio);
          const smaShort = calcSMA(shortP);
          const smaLong = calcSMA(longP);
          const currentDir = calcTrendDirection(smaShort, smaLong);
          const entryRegime = this.entryRegimes.get(pos.conditionId);

          if (currentRegime !== entryRegime) {
            const againstPosition =
              (pos.side === 'yes' && currentDir === 'down') ||
              (pos.side === 'no' && currentDir === 'up');
            if (againstPosition) {
              shouldExit = true;
              reason = `regime shift (${entryRegime} → ${currentRegime}) + trend reversal`;
            }
          }
        }
      }

      if (shouldExit) {
        await this.exitPosition(pos, currentPrice!, reason);
        toRemove.push(i);
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      const conditionId = this.positions[toRemove[i]].conditionId;
      this.entryRegimes.delete(conditionId);
      this.entryTrendDirs.delete(conditionId);
      this.positions.splice(toRemove[i], 1);
    }
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordTick(market.yesTokenId, ba.mid);

        const shortPrices = this.getPrices(market.yesTokenId, this.cfg.shortWindow);
        const longPrices = this.getPrices(market.yesTokenId, this.cfg.longWindow);
        if (shortPrices.length < this.cfg.shortWindow) continue;
        if (longPrices.length < this.cfg.longWindow) continue;

        const regime = detectRegime(shortPrices, longPrices, this.cfg.trendThreshold, this.cfg.volatileAtrRatio);
        const smaShort = calcSMA(shortPrices);
        const smaLong = calcSMA(longPrices);
        const trendDir = calcTrendDirection(smaShort, smaLong);
        const currentPrice = ba.mid;

        let side: 'yes' | 'no' | null = null;

        if (regime === 'trending') {
          const depth = calcPullbackDepth(shortPrices, currentPrice);
          if (depth <= this.cfg.trendingPullbackPct && currentPrice > smaLong) {
            side = trendDir === 'up' ? 'yes' : 'no';
          }
        } else if (regime === 'ranging') {
          const obi = calcOBI(book);
          if (obi > this.cfg.obiEntryThreshold) side = 'yes';
          else if (obi < 1 / this.cfg.obiEntryThreshold) side = 'no';
        } else if (regime === 'volatile') {
          const atrLong = calcATR(longPrices);
          const trendStrength = atrLong > 0 ? Math.abs(smaShort - smaLong) / atrLong : 0;
          if (trendStrength > 2.0) {
            const depth = calcPullbackDepth(shortPrices, currentPrice);
            if (depth <= this.cfg.volatilePullbackPct && currentPrice > smaLong) {
              side = trendDir === 'up' ? 'yes' : 'no';
            }
          }
        }

        if (!side) continue;
        if (side === 'no' && !market.noTokenId) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        const posSize = this.cfg.baseSizeUsdc * this.getSizeMultiplier(regime);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, posSize);
        this.entryRegimes.set(market.conditionId, regime);
        this.entryTrendDirs.set(market.conditionId, trendDir);

        logger.debug('Regime-adaptive entry', this.strategyName, {
          conditionId: market.conditionId, side, regime, trendDir,
          entryPrice: entryPrice.toFixed(4), size: posSize.toFixed(2),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, { market: market.conditionId, err: String(err) });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
        trackedMarkets: this.priceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface RegimeAdaptiveMomentumDeps extends StrategyDeps {
  config?: Partial<RegimeAdaptiveMomentumConfig>;
}

export function createRegimeAdaptiveMomentumTick(
  deps: RegimeAdaptiveMomentumDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new RegimeAdaptiveMomentumStrategy(baseDeps, config);
  return strategy.toTickFn();
}
