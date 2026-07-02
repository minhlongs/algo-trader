/**
 * Order Flow Toxicity Strategy — V2 implementation.
 *
 * Estimates VPIN (Volume-synchronized Probability of Informed Trading)
 * from order book changes between ticks. When VPIN exceeds a threshold
 * the flow is considered toxic (adverse selection risk high) and the
 * strategy pauses trading until toxicity subsides.
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
import { calcStdDev } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface OrderFlowToxicityConfig extends BaseStrategyConfig {
  /** Number of volume buckets for VPIN calculation */
  bucketCount: number;
  /** VPIN threshold above which flow is toxic (> 0.5 = more toxic) */
  toxicityThreshold: number;
  /** Minimum market volume to consider */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Markets to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: OrderFlowToxicityConfig = {
  bucketCount: 10,
  toxicityThreshold: 0.6,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 4 * 60_000,
  maxPositions: 2,
  cooldownMs: 30_000,
  positionSize: '25',
};

const STRATEGY_NAME: StrategyName = 'order-flow-toxicity';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Estimate buy/sell volume imbalance from two order book snapshots.
 * Positive = net buy pressure, negative = net sell pressure.
 */
export function estimateTradeImbalance(prev: RawOrderBook, curr: RawOrderBook): number {
  const prevBidVol = prev.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const prevAskVol = prev.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  const currBidVol = curr.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const currAskVol = curr.asks.reduce((s, l) => s + parseFloat(l.size), 0);

  const bidDelta = prevBidVol - currBidVol;
  const askDelta = prevAskVol - currAskVol;

  const total = Math.abs(bidDelta) + Math.abs(askDelta);
  if (total <= 0) return 0;
  return (bidDelta - askDelta) / total;
}

/**
 * Compute VPIN: fraction of imbalance buckets classified as buy-initiated.
 */
export function calcVPIN(imbalances: number[]): number {
  if (imbalances.length === 0) return 0.5;
  const buyBuckets = imbalances.filter(imb => imb > 0).length;
  return buyBuckets / imbalances.length;
}

/**
 * Compute toxicity Z-score: how many std devs VPIN is from its mean.
 */
export function calcToxicityZScore(vpin: number, history: number[]): number {
  const mean = history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0.5;
  const std = history.length > 1 ? calcStdDev(history) : 0.1;
  if (std <= 0) return 0;
  return Math.abs(vpin - mean) / std;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class OrderFlowToxicityStrategy extends BasePolymarketStrategy {
  private readonly cfg: OrderFlowToxicityConfig;
  private readonly prevBooks = new Map<string, RawOrderBook>();
  private readonly imbalanceHistory = new Map<string, number[]>();
  private readonly vpinHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<OrderFlowToxicityConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private isToxic(vpin: number): boolean {
    return vpin > this.cfg.toxicityThreshold || vpin < (1 - this.cfg.toxicityThreshold);
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

        const prev = this.prevBooks.get(market.yesTokenId);
        if (prev) {
          const imb = estimateTradeImbalance(prev, book);
          let hist = this.imbalanceHistory.get(market.yesTokenId);
          if (!hist) { hist = []; this.imbalanceHistory.set(market.yesTokenId, hist); }
          hist.push(imb);
          if (hist.length > this.cfg.bucketCount) hist.splice(0, hist.length - this.cfg.bucketCount);

          if (hist.length >= this.cfg.bucketCount) {
            const vpin = calcVPIN(hist);
            let vpinHist = this.vpinHistory.get(market.yesTokenId);
            if (!vpinHist) { vpinHist = []; this.vpinHistory.set(market.yesTokenId, vpinHist); }
            vpinHist.push(vpin);
            if (vpinHist.length > 20) vpinHist.splice(0, vpinHist.length - 20);

            const zScore = calcToxicityZScore(vpin, vpinHist);

            if (!this.isToxic(vpin) && zScore < 2.0) {
              const side = imb > 0 ? 'yes' : 'no';
              if (side === 'no' && !market.noTokenId) continue;

              const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
              const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

              await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

              logger.debug('Order flow entry', STRATEGY_NAME, {
                conditionId: market.conditionId, side, vpin: vpin.toFixed(3),
                zScore: zScore.toFixed(2), imb: imb.toFixed(3),
              });
            } else {
              logger.debug('Toxic flow — skip', STRATEGY_NAME, {
                conditionId: market.conditionId, vpin: vpin.toFixed(3), zScore: zScore.toFixed(2),
              });
            }
          }
        }
        this.prevBooks.set(market.yesTokenId, book);
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
        trackedMarkets: this.imbalanceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

// ── Legacy factory ───────────────────────────────────────────────────────────

export function createOrderFlowToxicityTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new OrderFlowToxicityStrategy(deps);
  return strategy.toTickFn();
}
