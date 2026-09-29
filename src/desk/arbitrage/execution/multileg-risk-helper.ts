/**
 * RiskGuard integration helpers for multi-leg arbitrage execution.
 *
 * @module desk/arbitrage/execution/multileg-risk-helper
 */

import type { ArbitrageRiskGuard, MultiLegArbitrageBasket } from '../arbitrage-risk-guard';
import type { MultiLegArbitrageOrder } from '../execution-types';

/**
 * Build MultiLegArbitrageBasket from parsed order for risk evaluation.
 */
export function buildArbitrageBasket(order: MultiLegArbitrageOrder): MultiLegArbitrageBasket {
  return {
    basketId: order.orderId,
    opportunityId: order.opportunityId,
    strategyKey: order.strategyKey,
    legs: order.legs.map((l) => ({
      legId: l.legId,
      venue: l.venue,
      symbol: l.symbol,
      side: l.side,
      amount: l.amount,
      price: l.price,
      notionalUsd: l.amount * l.price,
    })),
    totalNotionalUsd: order.legs.reduce((sum, l) => sum + l.amount * l.price, 0),
  };
}
