/**
 * Microstructure Alpha Strategy — V2 implementation.
 *
 * Extracts alpha from order book depth imbalance. Computes a weighted
 * bid/ask volume ratio at the top N price levels. When the imbalance
 * exceeds a configurable threshold, enters in the direction of the
 * dominant side.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import { calcSMA } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface MicrostructureAlphaConfig extends BaseStrategyConfig {
  depthLevels: number;
  imbalanceThreshold: number;
  minVolume: number;
  priceWindow: number;
  baseSizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: MicrostructureAlphaConfig = {
  depthLevels: 5,
  imbalanceThreshold: 2.0,
  minVolume: 1000,
  priceWindow: 5,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 5 * 60_000,
  maxPositions: 3,
  cooldownMs: 60_000,
  positionSize: '25',
};

const STRATEGY_NAME: StrategyName = 'microstructure-alpha';

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function calcWeightedImbalance(book: RawOrderBook, levels: number): number {
  const bids = book.bids.slice(0, levels);
  const asks = book.asks.slice(0, levels);
  if (bids.length === 0 || asks.length === 0) return 1;

  const maxLevels = Math.max(bids.length, asks.length);
  let weightedBidVol = 0;
  let weightedAskVol = 0;

  for (let i = 0; i < maxLevels; i++) {
    const weight = maxLevels - i;
    if (i < bids.length) weightedBidVol += parseFloat(bids[i]!.price) * parseFloat(bids[i]!.size) * weight;
    if (i < asks.length) weightedAskVol += parseFloat(asks[i]!.price) * parseFloat(asks[i]!.size) * weight;
  }

  if (weightedAskVol <= 0) return weightedBidVol > 0 ? 10 : 1;
  return Math.min(10, Math.max(0.1, weightedBidVol / weightedAskVol));
}

export function calcSpreadPct(book: RawOrderBook): number {
  if (book.bids.length === 0 || book.asks.length === 0) return 0;
  const bid = parseFloat(book.bids[0]!.price);
  const ask = parseFloat(book.asks[0]!.price);
  if (bid <= 0 || ask <= 0) return 0;
  return (ask - bid) / ((bid + ask) / 2);
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class MicrostructureAlphaStrategy extends BasePolymarketStrategy {
  private readonly cfg: MicrostructureAlphaConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<MicrostructureAlphaConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let h = this.priceHistory.get(tokenId);
    if (!h) { h = []; this.priceHistory.set(tokenId, h); }
    h.push(price);
    if (h.length > this.cfg.priceWindow * 3) {
      h.splice(0, h.length - this.cfg.priceWindow * 3);
    }
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

        const imbalance = calcWeightedImbalance(book, this.cfg.depthLevels);
        const spreadPct = calcSpreadPct(book);
        if (spreadPct > 0.10) continue;

        let side: 'yes' | 'no' | null = null;
        if (imbalance >= this.cfg.imbalanceThreshold) {
          side = 'yes';
        } else if (imbalance <= 1 / this.cfg.imbalanceThreshold) {
          side = 'no';
        }
        if (!side) continue;
        if (side === 'no' && !market.noTokenId) continue;

        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length >= 2) {
          const sma = calcSMA(prices);
          if (side === 'yes' && ba.mid < sma * 0.98) continue;
          if (side === 'no' && ba.mid > sma * 1.02) continue;
        }

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

        logger.debug('Microstructure alpha entry', STRATEGY_NAME, {
          conditionId: market.conditionId, side, imbalance: imbalance.toFixed(2),
          spreadPct: (spreadPct * 100).toFixed(2),
          entryPrice: entryPrice.toFixed(4), size: this.cfg.baseSizeUsdc.toFixed(2),
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

export function createMicrostructureAlphaTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new MicrostructureAlphaStrategy(deps);
  return strategy.toTickFn();
}
