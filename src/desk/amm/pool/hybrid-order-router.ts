/**
 * Hybrid Order Router (CLOB + AMM Waterfall Router)
 * Routes orders across resting CLOB limit orders and AMM pricing curves,
 * filling best available prices first to minimize execution slippage.
 */

import { logger } from '../../../shared/utils/logger';
import {
  HybridRouteResult,
  InboundOrder,
  OrderbookSnapshot,
  RouteLeg,
} from '../types/amm-types';
import { MultiTokenPool } from './multi-token-pool';

export class HybridOrderRouter {
  public static routeOrder(
    order: InboundOrder,
    pool: MultiTokenPool,
    orderbook?: OrderbookSnapshot
  ): HybridRouteResult {
    const outcomeIdx = order.outcomeIndex;
    const side = order.side;
    let remainingSize = order.size;
    const legs: RouteLeg[] = [];
    let totalCostUsdc = 0;

    const spotPrices = pool.getSpotPrices();
    const ammSpotPrice = spotPrices[outcomeIdx];

    // Stage 1: Waterfall fill against CLOB if price is better than AMM
    if (orderbook && remainingSize > 0) {
      if (side === 'BUY') {
        const sortedAsks = [...orderbook.asks].sort((a, b) => a.price - b.price);
        for (const level of sortedAsks) {
          if (remainingSize <= 0) break;
          // Buy from CLOB while ask price is better than or equal to AMM spot price
          if (level.price < ammSpotPrice && level.size > 0) {
            const fillSize = Math.min(remainingSize, level.size);
            const cost = fillSize * level.price;
            legs.push({
              venue: 'CLOB',
              outcomeIndex: outcomeIdx,
              price: level.price,
              size: fillSize,
              costUsdc: cost,
            });
            totalCostUsdc += cost;
            remainingSize -= fillSize;
          }
        }
      } else {
        const sortedBids = [...orderbook.bids].sort((a, b) => b.price - a.price);
        for (const level of sortedBids) {
          if (remainingSize <= 0) break;
          // Sell to CLOB while bid price is higher than AMM spot price
          if (level.price > ammSpotPrice && level.size > 0) {
            const fillSize = Math.min(remainingSize, level.size);
            const cost = fillSize * level.price;
            legs.push({
              venue: 'CLOB',
              outcomeIndex: outcomeIdx,
              price: level.price,
              size: fillSize,
              costUsdc: cost,
            });
            totalCostUsdc += cost;
            remainingSize -= fillSize;
          }
        }
      }
    }

    // Stage 2: Route remaining size through AMM curve
    if (remainingSize > 0) {
      if (side === 'BUY') {
        // Approximate USDC budget needed for remaining shares, then execute trade
        const estimatedBudget = remainingSize * ammSpotPrice * 1.05;
        const tradeRes = pool.executeTrade({
          poolId: pool.poolId,
          outcomeIndex: outcomeIdx,
          action: 'BUY',
          amount: estimatedBudget,
        });
        const filledAmm = tradeRes.outputAmount;
        const costAmm = tradeRes.inputAmount;
        legs.push({
          venue: 'AMM',
          outcomeIndex: outcomeIdx,
          price: tradeRes.effectivePrice,
          size: filledAmm,
          costUsdc: costAmm,
        });
        totalCostUsdc += costAmm;
        remainingSize = Math.max(0, remainingSize - filledAmm);
      } else {
        const tradeRes = pool.executeTrade({
          poolId: pool.poolId,
          outcomeIndex: outcomeIdx,
          action: 'SELL',
          amount: remainingSize,
        });
        const proceeds = tradeRes.outputAmount;
        legs.push({
          venue: 'AMM',
          outcomeIndex: outcomeIdx,
          price: tradeRes.effectivePrice,
          size: remainingSize,
          costUsdc: proceeds,
        });
        totalCostUsdc += proceeds;
        remainingSize = 0;
      }
    }

    const filledSize = order.size - remainingSize;
    const vwap = filledSize > 0 ? totalCostUsdc / filledSize : 0;

    logger.debug('[HybridOrderRouter] Completed waterfall routing', {
      orderId: order.orderId,
      side,
      requestedSize: order.size,
      filledSize,
      vwap,
      legCount: legs.length,
    });

    return {
      orderId: order.orderId,
      outcomeIndex: outcomeIdx,
      side,
      requestedSize: order.size,
      filledSize,
      totalCostUsdc,
      vwap,
      legs,
      fullyFilled: remainingSize <= 1e-6,
    };
  }
}
