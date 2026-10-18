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
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type OrderArrivalRateConfig,
  type OrderBookSnapshot,
  DEFAULT_CONFIG,
  countNewLevels,
  calcArrivalAsymmetry,
  isSignalActive,
  extractPriceLevels,
} from './order-arrival-rate-helpers';

export * from './order-arrival-rate-helpers';

const STRATEGY_NAME = 'order-arrival-rate' as StrategyName;

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
