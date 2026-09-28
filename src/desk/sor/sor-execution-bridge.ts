/**
 * SOR Execution Bridge (Milestone 3 - R3)
 * Wires SmartOrderRouter optimization to TriModeDispatcher with multi-venue price improvement.
 */

import { SmartOrderRouter } from './sor-router';
import type { RoutingRequest, RoutingPlan } from './sor-types';
import type { TriModeDispatcher } from '../execution/tri-mode-dispatcher';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import type { DispatchResult } from '../execution/tri-mode-types';
import { logger } from '../../shared/utils/logger';

export interface SorBridgeResult {
  readonly plan: RoutingPlan;
  readonly dispatches: DispatchResult[];
  readonly totalExecutedQuantity: number;
  readonly netPriceImprovementBps: number;
}

export class SorExecutionBridge {
  private readonly router: SmartOrderRouter;
  private readonly dispatcher: TriModeDispatcher;

  constructor(router: SmartOrderRouter, dispatcher: TriModeDispatcher) {
    this.router = router;
    this.dispatcher = dispatcher;
  }

  public routeAndDispatch(
    intent: UnifiedTradeIntent,
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  ): SorBridgeResult {
    const req: RoutingRequest = {
      symbol: intent.symbol,
      side: intent.side,
      targetQuantity: intent.quantity,
      maxSlippageBps: 50,
      urgency,
    };

    let plan: RoutingPlan;
    try {
      plan = this.router.route(req);
    } catch (err) {
      logger.warn(`[SorExecutionBridge] SOR routing fallback to single venue: ${String(err)}`);
      const fallbackPrice = intent.price ?? 65000;
      plan = {
        routeId: `fallback-${Date.now()}`,
        symbol: intent.symbol,
        side: intent.side,
        totalQuantity: intent.quantity,
        allocations: [{
          venueId: intent.venue,
          quantity: intent.quantity,
          limitPrice: fallbackPrice,
          feeUsd: (intent.quantity * fallbackPrice * 7.5) / 10000,
          gasCostUsd: 0,
        }],
        expectedEffectivePrice: fallbackPrice,
        expectedTotalFeeUsd: (intent.quantity * fallbackPrice * 7.5) / 10000,
        expectedGasCostUsd: 0,
        expectedNetProceedsUsd: intent.quantity * fallbackPrice,
        priceImprovementBps: 0,
        timestamp: Date.now(),
      };
    }

    const dispatches: DispatchResult[] = [];
    let totalExecuted = 0;

    for (const alloc of plan.allocations) {
      const legPrice = alloc.effectivePrice ?? alloc.limitPrice;
      const legIntent: UnifiedTradeIntent = {
        ...intent,
        venue: alloc.venueId,
        quantity: alloc.quantity,
        price: legPrice,
      };

      const res = this.dispatcher.dispatch(legIntent, legPrice);
      dispatches.push(res);
      totalExecuted += res.executedQuantity;
    }

    return {
      plan,
      dispatches,
      totalExecutedQuantity: totalExecuted,
      netPriceImprovementBps: plan.priceImprovementBps,
    };
  }
}
