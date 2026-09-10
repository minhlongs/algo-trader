/**
 * Whale Tracker V2 — Strategy Class and Factory
 *
 * Submodule extracted from whale-tracker-v2.ts to keep files under 200 lines.
 * Contains the WhaleTrackerStrategy class and the legacy tick factory.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  WhaleTrackerConfig,
  DEFAULT_CONFIG,
  WhaleEvent,
  detectWhaleOrders,
  calcWhaleImbalance,
  shouldEnter,
} from './whale-tracker-v2-helpers';

const STRATEGY_NAME: StrategyName = 'whale-tracker';

export class WhaleTrackerStrategy extends BasePolymarketStrategy {
  private readonly cfg: WhaleTrackerConfig;

  // Per-market whale event history
  private readonly whaleHistory = new Map<string, WhaleEvent[]>();

  constructor(deps: StrategyDeps, config: Partial<WhaleTrackerConfig> = {}) {
    const fullConfig: WhaleTrackerConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Whale event state management ──────────────────────────────────────────

  private recordWhaleEvents(tokenId: string, events: WhaleEvent[]): void {
    let history = this.whaleHistory.get(tokenId);
    if (!history) {
      history = [];
      this.whaleHistory.set(tokenId, history);
    }
    history.push(...events);

    // Prune events outside the window
    const cutoff = Date.now() - this.cfg.whaleWindowMs;
    const firstValid = history.findIndex(e => e.timestamp >= cutoff);
    if (firstValid > 0) {
      history.splice(0, firstValid);
    } else if (firstValid === -1) {
      history.length = 0;
    }
  }

  private getRecentWhaleEvents(tokenId: string): WhaleEvent[] {
    const history = this.whaleHistory.get(tokenId);
    if (!history) return [];
    const cutoff = Date.now() - this.cfg.whaleWindowMs;
    return history.filter(e => e.timestamp >= cutoff);
  }

  // ── Custom exit: whale reversal ───────────────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book) return { exit: false, reason: '' };

    const newWhales = detectWhaleOrders(book, this.cfg.whaleThreshold);
    if (newWhales.length > 0) {
      this.recordWhaleEvents(pos.tokenId, newWhales);
    }

    const recentEvents = this.getRecentWhaleEvents(pos.tokenId);
    if (recentEvents.length < this.cfg.minWhaleEvents) {
      return { exit: false, reason: '' };
    }

    const imbalance = calcWhaleImbalance(recentEvents);

    if (pos.side === 'yes' && imbalance.askVolume > imbalance.bidVolume * this.cfg.imbalanceRatio) {
      return {
        exit: true,
        reason: `whale-reversal (ask dominance ratio=${(imbalance.askVolume / Math.max(imbalance.bidVolume, 0.01)).toFixed(2)})`,
      };
    }
    if (pos.side === 'no' && imbalance.bidVolume > imbalance.askVolume * this.cfg.imbalanceRatio) {
      return {
        exit: true,
        reason: `whale-reversal (bid dominance ratio=${(imbalance.bidVolume / Math.max(imbalance.askVolume, 0.01)).toFixed(2)})`,
      };
    }

    return { exit: false, reason: '' };
  }

  // ── Entry logic ──────────────────────────────────────────────────────────

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

        const newWhales = detectWhaleOrders(book, this.cfg.whaleThreshold);
        if (newWhales.length > 0) {
          this.recordWhaleEvents(market.yesTokenId, newWhales);
        }

        const recentEvents = this.getRecentWhaleEvents(market.yesTokenId);
        if (recentEvents.length < this.cfg.minWhaleEvents) continue;

        const imbalance = calcWhaleImbalance(recentEvents);
        const signal = shouldEnter(imbalance, this.cfg);
        if (!signal) continue;

        const side: 'yes' | 'no' = signal === 'buy-yes' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        const posSize = parseFloat(this.cfg.positionSize);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, posSize);

        logger.info('Entry position', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          whaleEvents: recentEvents.length,
          bidVolume: imbalance.bidVolume.toFixed(2),
          askVolume: imbalance.askVolume.toFixed(2),
          ratio: imbalance.ratio.toFixed(2),
          size: posSize,
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface WhaleTrackerDeps extends StrategyDeps {
  config?: Partial<WhaleTrackerConfig>;
}

export function createWhaleTrackerTick(deps: WhaleTrackerDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new WhaleTrackerStrategy(baseDeps, config);
  return strategy.toTickFn();
}
