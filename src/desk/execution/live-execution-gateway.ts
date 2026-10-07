/**
 * Live Execution Gateway
 *
 * Coordinates real-time order submission, pre-trade circuit breaker screening,
 * greedy smart order routing, and inventory-aware dynamic quotes.
 *
 * @module desk/execution/live-execution-gateway
 */

import { EventEmitter } from 'events';
import { PmSmartOrderRouter } from './pm-sor-engine';
import { CircuitBreakerSafeguard } from '../risk/circuit-breaker-safeguard';
import { DynamicLpEngine } from '../mm/dynamic-lp-engine';
import type { VenueBookSnapshot } from './pm-sor-types';
import type { MarketMakingContext, TwoSidedQuote } from '../mm/dynamic-lp-types';
import type {
  OrderIntent,
  ExecutionResult,
  GatewayStatus,
} from './live-execution-gateway-types';

export class LiveExecutionGateway extends EventEmitter {
  private readonly router: PmSmartOrderRouter;
  private readonly safeguard: CircuitBreakerSafeguard;
  private readonly lpEngine: DynamicLpEngine;

  private activeQuotes = new Map<string, TwoSidedQuote>();
  private totalOrdersProcessed = 0;
  private totalVolumeProcessed = 0;

  constructor(params: {
    router: PmSmartOrderRouter;
    safeguard: CircuitBreakerSafeguard;
    lpEngine: DynamicLpEngine;
  }) {
    super();
    this.router = params.router;
    this.safeguard = params.safeguard;
    this.lpEngine = params.lpEngine;

    this.safeguard.on('tripped', (signal) => {
      this.activeQuotes.clear();
      this.emit('emergencyHalt', signal);
    });
  }

  public executeOrder(params: {
    intent: OrderIntent;
    books: readonly VenueBookSnapshot[];
  }): ExecutionResult {
    const { intent, books } = params;
    const now = Date.now();
    const safeguardStatus = this.safeguard.getStatus();

    if (!safeguardStatus.isTradingAllowed) {
      return {
        intentId: intent.intentId,
        status: 'HALTED',
        rejectionReason: `Trading halted: safeguard state is ${safeguardStatus.state}`,
        executedAt: now,
      };
    }

    if (intent.targetQuantity <= 0) {
      return {
        intentId: intent.intentId,
        status: 'REJECTED',
        rejectionReason: 'Invalid target quantity: must be positive',
        executedAt: now,
      };
    }

    const routePlan = this.router.optimizeRoute({
      outcome: intent.outcome,
      action: intent.action,
      targetQuantity: intent.targetQuantity,
      books,
    });

    if (routePlan.filledQuantity === 0) {
      return {
        intentId: intent.intentId,
        status: 'REJECTED',
        routePlan,
        rejectionReason: 'Insufficient market liquidity across venues',
        executedAt: now,
      };
    }

    this.totalOrdersProcessed += 1;
    this.totalVolumeProcessed += routePlan.filledQuantity;

    const result: ExecutionResult = {
      intentId: intent.intentId,
      status: 'FILLED',
      routePlan,
      executedAt: now,
    };

    this.emit('orderExecuted', result);
    return result;
  }

  public refreshQuote(context: MarketMakingContext): TwoSidedQuote | null {
    const safeguardStatus = this.safeguard.getStatus();
    if (!safeguardStatus.isTradingAllowed) {
      this.activeQuotes.delete(context.marketId);
      return null;
    }

    const quote = this.lpEngine.generateQuote(context);
    this.activeQuotes.set(context.marketId, quote);
    this.emit('quoteUpdated', quote);
    return quote;
  }

  public cancelQuotes(): void {
    this.activeQuotes.clear();
    this.emit('quotesCancelled');
  }

  public getStatus(): GatewayStatus {
    const safeguardStatus = this.safeguard.getStatus();
    return {
      isOperational: safeguardStatus.isTradingAllowed,
      safeguard: safeguardStatus,
      activeQuotesCount: this.activeQuotes.size,
      totalOrdersProcessed: this.totalOrdersProcessed,
      totalVolumeProcessed: this.totalVolumeProcessed,
    };
  }
}
