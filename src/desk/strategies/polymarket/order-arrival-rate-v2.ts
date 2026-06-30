/**
 * Order Arrival Rate V2 — extends BasePolymarketStrategy.
 *
 * Monitors the rate of orderbook changes (new levels appearing) as a proxy
 * for order arrival rate. Sudden spikes signal incoming directional pressure.
 * Trades in the direction indicated by asymmetry of new orders.
 *
 * More new bids → BUY YES (bullish). More new asks → BUY NO (bearish).
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

export interface OrderArrivalRateConfig extends BaseStrategyConfig {
  asymmetryThreshold: number;
  minArrivalRate: number;
  snapshotWindow: number;
}

export const DEFAULT_CONFIG: OrderArrivalRateConfig = {
  asymmetryThreshold: 0.3,
  minArrivalRate: 3,
  snapshotWindow: 10,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 12 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'order-arrival-rate' as StrategyName;

// ── Internal types ───────────────────────────────────────────────────────────

interface OrderBookSnapshot {
  bidLevels: string[];
  askLevels: string[];
  timestamp: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function countNewLevels(prevLevels: string[], currentLevels: string[]): number {
  const prevSet = new Set(prevLevels);
  let count = 0;
  for (const level of currentLevels) {
    if (!prevSet.has(level)) count++;
  }
  return count;
}

export function calcArrivalAsymmetry(newBids: number, newAsks: number): number {
  const total = newBids + newAsks;
  if (total === 0) return 0;
  return (newBids - newAsks) / total;
}

export function isSignalActive(
  asymmetry: number, totalNew: number, threshold: number, minArrival: number,
): boolean {
  return Math.abs(asymmetry) > threshold && totalNew > minArrival;
}

export function extractPriceLevels(levels: { price: string; size: string }[]): string[] {
  return levels.map(l => l.price);
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class OrderArrivalRateStrategy extends BasePolymarketStrategy {
  private readonly cfg: OrderArrivalRateConfig;
  private readonly snapshots = new Map<string, OrderBookSnapshot[]>();

  constructor(deps: StrategyDeps, config: Partial<OrderArrivalRateConfig> = {}) {
    const fullConfig: OrderArrivalRateConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordSnapshot(tokenId: string, bidLevels: string[], askLevels: string[]): void {
    let history = this.snapshots.get(tokenId);
    if (!history) { history = []; this.snapshots.set(tokenId, history); }
    history.push({ bidLevels, askLevels, timestamp: Date.now() });
    if (history.length > this.cfg.snapshotWindow) {
      history.splice(0, history.length - this.cfg.snapshotWindow);
    }
  }

  private getSnapshots(tokenId: string): OrderBookSnapshot[] {
    return this.snapshots.get(tokenId) ?? [];
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

        const currentBidLevels = extractPriceLevels(book.bids);
        const currentAskLevels = extractPriceLevels(book.asks);
        const history = this.getSnapshots(market.yesTokenId);

        this.recordSnapshot(market.yesTokenId, currentBidLevels, currentAskLevels);
        if (history.length < 1) continue;

        const prevSnapshot = history[history.length - 1];
        const newBids = countNewLevels(prevSnapshot.bidLevels, currentBidLevels);
        const newAsks = countNewLevels(prevSnapshot.askLevels, currentAskLevels);
        const totalNew = newBids + newAsks;
        const asymmetry = calcArrivalAsymmetry(newBids, newAsks);

        if (!isSignalActive(asymmetry, totalNew, this.cfg.asymmetryThreshold, this.cfg.minArrivalRate)) continue;

        // Positive asymmetry (more new bids) → BUY YES
        const side: 'yes' | 'no' = asymmetry > 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Order arrival entry', this.strategyName, {
          conditionId: market.conditionId, side,
          entryPrice: entryPrice.toFixed(4),
          asymmetry: asymmetry.toFixed(4), totalNew, newBids, newAsks,
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

export interface OrderArrivalRateDeps extends StrategyDeps {
  config?: Partial<OrderArrivalRateConfig>;
}

export function createOrderArrivalRateTick(deps: OrderArrivalRateDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new OrderArrivalRateStrategy(baseDeps, config);
  return strategy.toTickFn();
}
