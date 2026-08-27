/**
 * Inventory Skew Rebalancer strategy for Polymarket.
 *
 * A portfolio-level strategy that monitors aggregate exposure across all
 * active positions and rebalances when skew exceeds thresholds. Prevents
 * concentration risk by:
 *   1. Tracking all open positions across markets (tokenId, side, size, currentPrice)
 *   2. Computing portfolio-level skew: (yesExposure - noExposure) / totalExposure
 *   3. Trimming overweight positions and adding to underweight ones when |skew| > threshold
 *   4. Enforcing per-market concentration limits
 *   5. Only trimming positions with positive unrealised P&L (don't sell losers)
 *
 * Split into focused modules (behavior unchanged, facade re-exports below):
 * - inventory-skew-types.ts: config, defaults, types, STRATEGY_NAME
 * - inventory-skew-math.ts: calcSkew, calcConcentration, shouldRebalance, unrealizedPnl
 * - inventory-skew-rebalance.ts: runRebalance (rebalance pass body)
 * - inventory-skew-concentration.ts: runConcentrationCheck (concentration check body)
 */

import { logger } from '../../core/logger';
import type {
  InventorySkewRebalancerConfig,
  InventorySkewRebalancerDeps,
  TrackedPosition,
} from './inventory-skew-types';
import { DEFAULT_CONFIG, STRATEGY_NAME } from './inventory-skew-types';
import { calcSkew } from './inventory-skew-math';
import { runRebalance } from './inventory-skew-rebalance';
import { runConcentrationCheck } from './inventory-skew-concentration';

// ── Facade re-exports: every existing importer keeps compiling unmodified ───────

// Pure helpers (exported for testing)
export { calcSkew, calcConcentration, shouldRebalance } from './inventory-skew-math';

// Types
export type {
  InventorySkewRebalancerConfig,
  InventorySkewRebalancerDeps,
  TrackedPosition,
} from './inventory-skew-types';

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createInventorySkewRebalancerTick(
  deps: InventorySkewRebalancerDeps,
): () => Promise<void> {
  const { clob, orderManager, eventBus } = deps;
  const cfg: InventorySkewRebalancerConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Portfolio state — populated via eventBus listener
  const positions: TrackedPosition[] = [];
  let lastRebalanceAt = 0;

  // Listen for trade executions to track positions
  eventBus.on('trade.executed', (raw) => {
    // eventBus emits `unknown`; narrow explicitly to the TradeExecutedPayload shape.
    const payload = raw as {
      trade: {
        orderId: string;
        marketId: string;
        side: 'buy' | 'sell';
        fillPrice: string;
        fillSize: string;
        fees: string;
        timestamp: number | string;
        strategy?: string;
      };
      pnl?: string;
      reason?: string;
    };

    const trade = payload.trade;
    const tokenId: string = trade.marketId;
    const side: 'yes' | 'no' = trade.side === 'buy' ? 'yes' : 'no';
    const size = parseFloat(trade.fillSize);
    const price = parseFloat(trade.fillPrice);
    const marketId: string = trade.marketId;

    if (size <= 0) return;

    // Upsert: if we already track this tokenId+side, add to size
    const existing = positions.find(p => p.tokenId === tokenId && p.side === side);
    if (existing) {
      // Weighted-average entry price
      const totalOldValue = existing.size * existing.entryPrice;
      existing.size += size;
      existing.entryPrice = (totalOldValue + size * price) / existing.size;
    } else {
      positions.push({
        tokenId,
        side,
        size,
        entryPrice: price,
        currentPrice: price,
        marketId,
      });
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function refreshPrices(): Promise<void> {
    for (const pos of positions) {
      try {
        const book = await clob.getOrderBook(pos.tokenId);
        const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
        const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
        pos.currentPrice = (bid + ask) / 2;
      } catch {
        // keep previous price
      }
    }
  }

  // ── Main tick ────────────────────────────────────────────────────────────

  return async function inventorySkewRebalancerTick(): Promise<void> {
    try {
      if (positions.length === 0) {
        logger.debug('No positions to rebalance', STRATEGY_NAME, {});
        return;
      }

      await refreshPrices();

      // Each pass captures its own Date.now(), matching the original inner functions.
      await runConcentrationCheck({ positions, cfg, orderManager, eventBus, now: Date.now() });
      lastRebalanceAt = await runRebalance({ positions, cfg, orderManager, eventBus, now: Date.now(), lastRebalanceAt });

      logger.debug('Tick complete', STRATEGY_NAME, {
        positionCount: positions.length,
        skew: calcSkew(positions).toFixed(4),
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}