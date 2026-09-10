/**
 * Price Impact Estimator - Position Exit Logic
 */

import { logger } from '../../core/logger';
import {
  STRATEGY_NAME,
  type PriceImpactEstimatorConfig,
  type PriceImpactEstimatorDeps,
} from './price-impact-estimator-types';
import { bestBidAsk } from './price-impact-estimator-algorithms';
import type { PriceImpactEstimatorState } from './price-impact-estimator-state';

export async function checkPriceImpactExits(
  deps: PriceImpactEstimatorDeps,
  cfg: PriceImpactEstimatorConfig,
  state: PriceImpactEstimatorState
): Promise<void> {
  const { clob, orderManager, eventBus } = deps;
  const { positions, cooldowns } = state;
  const now = Date.now();
  const toRemove: number[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    let shouldExit = false;
    let reason = '';

    // Get current price
    let currentPrice: number;
    try {
      const book = await clob.getOrderBook(pos.tokenId);
      const ba = bestBidAsk(book);
      currentPrice = ba.mid;
    } catch {
      continue; // skip if can't fetch
    }

    // Take profit / Stop loss
    if (pos.side === 'yes') {
      const gain = (currentPrice - pos.entryPrice) / pos.entryPrice;
      if (gain >= cfg.takeProfitPct) {
        shouldExit = true;
        reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
      } else if (-gain >= cfg.stopLossPct) {
        shouldExit = true;
        reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
      }
    } else {
      const gain = (pos.entryPrice - currentPrice) / pos.entryPrice;
      if (gain >= cfg.takeProfitPct) {
        shouldExit = true;
        reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
      } else if (-gain >= cfg.stopLossPct) {
        shouldExit = true;
        reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
      }
    }

    // Max hold time
    if (!shouldExit && now - pos.openedAt > cfg.maxHoldMs) {
      shouldExit = true;
      reason = 'max hold time';
    }

    if (shouldExit) {
      try {
        const exitSide = pos.side === 'yes' ? 'sell' : 'buy';
        await orderManager.placeOrder({
          tokenId: pos.tokenId,
          side: exitSide,
          price: currentPrice!.toFixed(4),
          size: String(Math.round(pos.sizeUsdc / currentPrice!)),
          orderType: 'IOC',
        });

        const pnl = pos.side === 'yes'
          ? (currentPrice! - pos.entryPrice) * (pos.sizeUsdc / pos.entryPrice)
          : (pos.entryPrice - currentPrice!) * (pos.sizeUsdc / pos.entryPrice);

        logger.info('Exit position', STRATEGY_NAME, {
          conditionId: pos.conditionId,
          side: pos.side,
          pnl: pnl.toFixed(4),
          reason,
        });

        eventBus.emit('trade.executed', {
          trade: {
            orderId: pos.orderId,
            marketId: pos.conditionId,
            side: exitSide,
            fillPrice: String(currentPrice),
            fillSize: String(pos.sizeUsdc),
            fees: '0',
            timestamp: Date.now(),
            strategy: STRATEGY_NAME,
          },
        });

        cooldowns.set(pos.tokenId, now + cfg.cooldownMs);
        toRemove.push(i);
      } catch (err) {
        logger.warn('Exit failed', STRATEGY_NAME, { tokenId: pos.tokenId, err: String(err) });
      }
    }
  }

  // Remove closed positions (reverse order)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    positions.splice(toRemove[i], 1);
  }
}
