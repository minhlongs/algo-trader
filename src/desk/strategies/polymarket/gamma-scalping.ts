/**
 * Gamma Scalping Strategy — V2 implementation.
 *
 * Estimates gamma exposure in binary option markets using the Black-Scholes
 * approximation for binary options. Gamma is highest near the 0.5 price
 * and near expiry. The strategy delta-hedges when gamma exceeds a threshold:
 * high gamma means small price moves generate large delta changes, creating
 * scalping opportunities.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import { calcStdDev } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface GammaScalpingConfig extends BaseStrategyConfig {
  /** Rolling window for implied volatility estimation */
  volWindow: number;
  /** Gamma threshold to trigger hedge (multiplier of baseline gamma) */
  gammaThreshold: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base hedge position size */
  baseSizeUsdc: number;
  /** Markets to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: GammaScalpingConfig = {
  volWindow: 20,
  gammaThreshold: 2.0,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 3 * 60_000,
  maxPositions: 3,
  cooldownMs: 30_000,
  positionSize: '25',
};

const STRATEGY_NAME: StrategyName = 'gamma-scalping';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Estimate implied volatility from price returns.
 */
export function calcImpliedVol(prices: number[]): number {
  if (prices.length < 5) return 0.5;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1]! > 0) {
      returns.push(Math.log(prices[i]! / prices[i - 1]!));
    }
  }
  return calcStdDev(returns) * Math.sqrt(365); // annualized
}

/**
 * Estimate time to expiry in years from ISO string end date.
 */
export function calcTimeToExpiry(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (end <= now) return 0.001; // minimum floor
  return (end - now) / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Approximate gamma for a binary option using the Black-Scholes binary
 * approximation. Gamma is approximated as the derivative of delta:
 *
 * Gamma ~= N'(d1) / (S * sigma * sqrt(T))
 *
 * where N'(d1) is the standard normal PDF.
 * For a binary, the gamma profile peaks near the strike (price = 0.5).
 *
 * @param price - current mid-price (0-1)
 * @param sigma - implied volatility (annualized)
 * @param tte - time to expiry in years
 * @returns estimated gamma (per unit of underlying)
 */
export function estimateBinaryGamma(price: number, sigma: number, tte: number): number {
  if (sigma <= 0 || tte <= 0) return 0;

  // Normalized price: treat 0.5 as "at-the-money" for binary
  const s = Math.max(0.001, Math.min(0.999, price));
  const d1 = (Math.log(s / (1 - s)) + (sigma * sigma / 2) * tte) / (sigma * Math.sqrt(tte));

  // Standard normal PDF
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);

  // Binary gamma approximation
  return nd1 / (s * (1 - s) * sigma * Math.sqrt(tte));
}

/**
 * Determine hedge direction from price position relative to 0.5 strike.
 * Above 0.5: long gamma means delta-positive, hedge by selling.
 * Below 0.5: long gamma means delta-negative, hedge by buying.
 */
export function calcHedgeDirection(price: number, gamma: number): 'yes' | 'no' | null {
  if (gamma <= 0) return null;
  // High gamma near strike — hedge in direction of delta exposure
  return price >= 0.5 ? 'no' : 'yes';
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class GammaScalpingStrategy extends BasePolymarketStrategy {
  private readonly cfg: GammaScalpingConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<GammaScalpingConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let h = this.priceHistory.get(tokenId);
    if (!h) { h = []; this.priceHistory.set(tokenId, h); }
    h.push(price);
    if (h.length > this.cfg.volWindow * 4) h.splice(0, h.length - this.cfg.volWindow * 4);
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if (market.volume < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length < 5) continue;

        const sigma = calcImpliedVol(prices);
        const tte = calcTimeToExpiry(market.endDate);
        const gamma = estimateBinaryGamma(ba.mid, sigma, tte);

        // Compute baseline gamma (gamma at 0.5 with same vol/tte)
        const baselineGamma = estimateBinaryGamma(0.5, sigma, tte);
        const gammaRatio = baselineGamma > 0 ? gamma / baselineGamma : 0;

        if (gammaRatio < this.cfg.gammaThreshold) continue;

        // Gamma is elevated — enter hedge position
        const side = calcHedgeDirection(ba.mid, gamma);
        if (!side) continue;
        if (side === 'no' && !market.noTokenId) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

        logger.debug('Gamma scalping entry', STRATEGY_NAME, {
          conditionId: market.conditionId, side,
          gamma: gamma.toFixed(4), gammaRatio: gammaRatio.toFixed(2),
          vol: (sigma * 100).toFixed(1), tte: tte.toFixed(2),
          price: ba.mid.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, { market: market.conditionId, err: String(err) });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: this.positions.length,
        trackedMarkets: this.priceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

// ── Legacy factory ───────────────────────────────────────────────────────────

export function createGammaScalpingTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new GammaScalpingStrategy(deps);
  return strategy.toTickFn();
}
