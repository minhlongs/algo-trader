/**
 * Inventory Skew Rebalancer — rebalance pass.
 * Split from inventory-skew-rebalancer.ts (S16 tranche 3).
 * runRebalance(ctx) is the former inner rebalance() body; behavior identical.
 * Returns the (possibly updated) lastRebalanceAt so the facade can persist it.
 */

import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import { logger } from '../../core/logger';
import type { InventorySkewRebalancerConfig, TrackedPosition } from './inventory-skew-types';
import { STRATEGY_NAME } from './inventory-skew-types';
import { calcSkew, calcConcentration, shouldRebalance, unrealizedPnl } from './inventory-skew-math';

/** Runtime context supplied by the facade for one rebalance pass. */
export interface RebalanceContext {
  positions: TrackedPosition[];
  cfg: InventorySkewRebalancerConfig;
  orderManager: OrderManager;
  eventBus: EventBus;
  now: number;
  lastRebalanceAt: number;
}

/**
 * Run one rebalance pass: trim overweight side, add to underweight side,
 * then drop negligible positions. Returns updated lastRebalanceAt.
 */
export async function runRebalance(ctx: RebalanceContext): Promise<number> {
  const { positions, cfg, orderManager, eventBus, now } = ctx;
  const skew = calcSkew(positions);

  if (!shouldRebalance(skew, cfg.skewThreshold, ctx.lastRebalanceAt, cfg.rebalanceIntervalMs, now)) {
    return ctx.lastRebalanceAt;
  }

  const lastRebalanceAt = now;
  let tradesPlaced = 0;

  // Determine which side is overweight
  const overweightSide: 'yes' | 'no' = skew > 0 ? 'yes' : 'no';
  const underweightSide: 'yes' | 'no' = skew > 0 ? 'no' : 'yes';

  // Sort overweight positions by value descending (trim largest first)
  const overweight = positions
    .filter(p => p.side === overweightSide)
    .sort((a, b) => b.size * b.currentPrice - a.size * a.currentPrice);

  for (const pos of overweight) {
    if (tradesPlaced >= cfg.maxTradesPerRebalance) break;

    const pnl = unrealizedPnl(pos);
    if (pnl < cfg.minPnlToTrim) continue;

    const trimSize = pos.size * cfg.trimPct;
    if (trimSize <= 0) continue;

    try {
      await orderManager.placeOrder({
        tokenId: pos.tokenId,
        side: 'sell',
        price: pos.currentPrice.toFixed(4),
        size: String(trimSize),
        orderType: 'IOC',
      });

      pos.size -= trimSize;
      tradesPlaced++;

      logger.info('Trimmed overweight position', STRATEGY_NAME, {
        tokenId: pos.tokenId,
        side: pos.side,
        trimSize,
        remaining: pos.size,
        pnl: pnl.toFixed(4),
      });

      eventBus.emit('trade.executed', {
        trade: {
          orderId: `rebal-${now}-${tradesPlaced}`,
          marketId: pos.marketId,
          side: 'sell',
          fillPrice: String(pos.currentPrice),
          fillSize: String(trimSize),
          fees: '0',
          timestamp: now,
          strategy: STRATEGY_NAME,
        },
      });
    } catch (err) {
      logger.warn('Trim order failed', STRATEGY_NAME, {
        tokenId: pos.tokenId,
        err: String(err),
      });
    }
  }

  // Buy underweight side if we still have trade budget
  if (tradesPlaced < cfg.maxTradesPerRebalance) {
    const underweight = positions.filter(p => p.side === underweightSide);
    // Pick the position with lowest concentration to add to (spread risk)
    const sorted = underweight.sort(
      (a, b) => calcConcentration(a, positions) - calcConcentration(b, positions),
    );

    for (const pos of sorted) {
      if (tradesPlaced >= cfg.maxTradesPerRebalance) break;

      const buySize = parseFloat(cfg.positionSize);
      if (buySize <= 0) continue;

      try {
        await orderManager.placeOrder({
          tokenId: pos.tokenId,
          side: 'buy',
          price: pos.currentPrice.toFixed(4),
          size: String(buySize),
          orderType: 'IOC',
        });

        pos.size += buySize;
        tradesPlaced++;

        logger.info('Added to underweight position', STRATEGY_NAME, {
          tokenId: pos.tokenId,
          side: pos.side,
          addedSize: buySize,
          newSize: pos.size,
        });
      } catch (err) {
        logger.warn('Buy order failed', STRATEGY_NAME, {
          tokenId: pos.tokenId,
          err: String(err),
        });
      }
    }
  }

  // Remove positions with negligible size
  for (let i = positions.length - 1; i >= 0; i--) {
    if (positions[i].size < 1e-9) {
      positions.splice(i, 1);
    }
  }

  return lastRebalanceAt;
}