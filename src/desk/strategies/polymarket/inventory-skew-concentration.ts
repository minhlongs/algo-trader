/**
 * Inventory Skew Rebalancer — per-market concentration check.
 * Split from inventory-skew-rebalancer.ts (S16 tranche 3).
 * runConcentrationCheck(ctx) is the former inner checkConcentration() body;
 * behavior identical.
 */

import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import { logger } from '../../core/logger';
import type { InventorySkewRebalancerConfig, TrackedPosition } from './inventory-skew-types';
import { STRATEGY_NAME } from './inventory-skew-types';
import { calcConcentration, unrealizedPnl } from './inventory-skew-math';

/** Runtime context supplied by the facade for one concentration check. */
export interface ConcentrationContext {
  positions: TrackedPosition[];
  cfg: InventorySkewRebalancerConfig;
  orderManager: OrderManager;
  eventBus: EventBus;
  now: number;
}

/** Trim any position whose concentration exceeds cfg.maxConcentrationPct. */
export async function runConcentrationCheck(ctx: ConcentrationContext): Promise<void> {
  const { positions, cfg, orderManager, eventBus, now } = ctx;
  let tradesPlaced = 0;

  for (const pos of positions) {
    if (tradesPlaced >= cfg.maxTradesPerRebalance) break;

    const concentration = calcConcentration(pos, positions);
    if (concentration <= cfg.maxConcentrationPct) continue;

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

      logger.info('Trimmed concentrated position', STRATEGY_NAME, {
        tokenId: pos.tokenId,
        concentration: concentration.toFixed(4),
        trimSize,
        remaining: pos.size,
      });

      eventBus.emit('trade.executed', {
        trade: {
          orderId: `conc-${now}-${tradesPlaced}`,
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
      logger.warn('Concentration trim failed', STRATEGY_NAME, {
        tokenId: pos.tokenId,
        err: String(err),
      });
    }
  }
}