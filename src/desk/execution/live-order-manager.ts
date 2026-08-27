/**
 * Live Order Manager — Facade
 *
 * Order lifecycle for live Polymarket CLOB trading: submit signed orders →
 * poll for fill status (exponential backoff) → confirm fills → record in
 * position tracker. REST polling (no WebSocket). Orders auto-expire after
 * maxOrderLifetimeMs (default 5 min).
 *
 * Hard Risk Circuit: SignalTTL (200ms) + token-bucket rate limiter (5/sec,
 * burst 10) per strategy.
 *
 * Split into leaf modules (types, polling, terminal, risk-gates) to stay
 * under 200 LOC. Leaves operate via structural LiveOrderManagerCtx — fields
 * are public/readonly (not private) for structural assignability.
 */

import { EventEmitter } from 'events';
import type { PolymarketAdapter, PolymarketOrderResponse } from './polymarket-adapter';
import type { PolymarketOrder } from './polymarket-signer';
import type { LivePositionTracker } from './live-position-tracker';
import { logger } from '../../shared/utils/logger';
import type { TradeSignal } from '../polymarket/strategy-live-bridge';
import type { RiskGateManager } from '../risk/risk-gate-manager';
import { requireLiveEnabled } from './execution-mode';
import { TokenBucketRateLimiter } from './token-bucket-rate-limiter';
import {
  DEFAULT_MAX_ORDER_LIFETIME,
  RATE_LIMIT_BURST,
  RATE_LIMIT_ORDERS_PER_SEC,
  type OrderState,
} from './live-order-manager-types';
import { schedulePollFor } from './live-order-polling';
import { handleFillFor } from './live-order-manager-terminal';
import { runRiskGates } from './live-order-risk-gates';

// ── Facade re-exports (importers compile UNMODIFIED) ───────────────────────────
export { TokenBucketRateLimiter } from './token-bucket-rate-limiter';
export type { OrderState, OrderTerminalState, LiveOrderManagerEvents } from './live-order-manager-types';

// ── Manager ────────────────────────────────────────────────────────────────────

export class LiveOrderManager extends EventEmitter {
  // Public (not private) so the instance satisfies the structural
  // LiveOrderManagerCtx interface used by the leaf modules.
  activeOrders = new Map<string, OrderState>();
  pollTimers = new Map<string, NodeJS.Timeout>();
  readonly adapter: PolymarketAdapter;
  readonly positionTracker: LivePositionTracker;
  readonly maxOrderLifetimeMs: number;
  stopped = false;

  // Rate limiter per strategy
  strategyRateLimiters = new Map<string, TokenBucketRateLimiter>();

  constructor(
    adapter: PolymarketAdapter,
    positionTracker: LivePositionTracker,
    maxOrderLifetimeMs: number = DEFAULT_MAX_ORDER_LIFETIME,
    readonly riskGateManager?: RiskGateManager,
  ) {
    super();
    this.adapter = adapter;
    this.positionTracker = positionTracker;
    this.maxOrderLifetimeMs = maxOrderLifetimeMs;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  /** Submit a signed order to CLOB and begin polling for fill status */
  async submitAndTrack(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    if (this.stopped) throw new Error('LiveOrderManager is stopped');

    // Hard env gate: LIVE mode requires the operator to set
    // LIVE_TRADING_ENABLED=true explicitly. Without this, no order can reach
    // the exchange regardless of how the guard was configured.
    requireLiveEnabled('LiveOrderManager.submitAndTrack');

    const response = await this.adapter.placeOrder(order);

    const state: OrderState = {
      orderId: response.orderID,
      tokenId: order.tokenId,
      side: order.side,
      size: order.size,
      price: order.price,
      status: response.status === 'matched' ? 'matched' : 'pending',
      submittedAt: Date.now(),
      lastPollAt: Date.now(),
      pollAttempts: 0,
    };

    this.activeOrders.set(response.orderID, state);

    if (response.status === 'matched') {
      this.handleFill(state);
    } else {
      this.schedulePoll(response.orderID);
    }

    return response;
  }

  /** Submit order without tracking (fire-and-forget) */
  async submitOnly(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    return this.adapter.placeOrder(order);
  }

  // ── Hard Risk Circuit: Signal Processing ─────────────────────────────────────

  /**
   * Submit a TradeSignal through Hard Risk Circuit gates — the FINAL gate
   * before any order reaches the CLOB (cannot be bypassed by strategy logic).
   * Gate order: SignalTTL → Rate Limiter → LiveExecutionGuard → submitAndTrack.
   * Throws if rejected; returns PolymarketOrderResponse if approved.
   */
  async submitSignal(
    signal: TradeSignal,
    strategyName: string
  ): Promise<PolymarketOrderResponse> {
    return runRiskGates(signal, strategyName, this);
  }

  /** Get or create rate limiter for a strategy */
  getRateLimiter(strategyName: string): TokenBucketRateLimiter {
    let limiter = this.strategyRateLimiters.get(strategyName);
    if (!limiter) {
      limiter = new TokenBucketRateLimiter(RATE_LIMIT_BURST, RATE_LIMIT_ORDERS_PER_SEC);
      this.strategyRateLimiters.set(strategyName, limiter);
    }
    return limiter;
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancelOrder(orderId: string): Promise<void> {
    const timer = this.pollTimers.get(orderId);
    if (timer) clearTimeout(timer);
    this.pollTimers.delete(orderId);

    try {
      await this.adapter.cancelOrder(orderId);
    } catch (err) {
      logger.warn(`Failed to cancel order ${orderId}`, 'LiveOrderManager', {
        err: String(err),
      });
    }

    const state = this.activeOrders.get(orderId);
    if (state) {
      state.status = 'canceled';
      this.emit('canceled', orderId);
    }
    this.activeOrders.delete(orderId);
  }

  async cancelAll(): Promise<number> {
    const ids = Array.from(this.activeOrders.keys());
    await Promise.allSettled(ids.map((id) => this.cancelOrder(id)));
    return ids.length;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getActiveOrders(): OrderState[] {
    return Array.from(this.activeOrders.values());
  }

  getOrder(orderId: string): OrderState | undefined {
    return this.activeOrders.get(orderId);
  }

  hasActiveOrders(): boolean {
    return this.activeOrders.size > 0;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Stop all polling and cancel all active orders */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.pollTimers.values()) {
      clearTimeout(timer);
    }
    this.pollTimers.clear();
    await this.cancelAll();
    logger.info('LiveOrderManager stopped', 'LiveOrderManager', {
      cancelledOrders: this.activeOrders.size,
    });
  }

  // ── Private: thin delegates to leaf modules (called by submitAndTrack) ─────

  private schedulePoll(orderId: string): void {
    schedulePollFor(this, orderId);
  }

  private handleFill(state: OrderState): void {
    handleFillFor(this, state);
  }
}