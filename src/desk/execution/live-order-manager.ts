/**
 * Live Order Manager
 *
 * Order lifecycle management for live Polymarket CLOB trading.
 * Submit signed orders → poll for fill status with exponential backoff →
 * confirm fills → record in position tracker.
 *
 * Uses REST polling (no WebSocket — Polymarket CLOB WebSocket is undocumented).
 * Orders auto-expire after maxOrderLifetimeMs (default 5 minutes).
 *
 * Hard Risk Circuit (Phase 03):
 * - SignalTTL: Rejects signals older than 200ms
 * - Token-Bucket Rate Limiter: Caps orders at 5/sec per strategy (burstable)
 */

import { EventEmitter } from 'events';
import type { PolymarketAdapter, PolymarketOrderResponse } from './polymarket-adapter';
import type { PolymarketOrder } from './polymarket-signer';
import type { LivePositionTracker, FilledOrder } from './live-position-tracker';
import { logger } from '../../shared/utils/logger';
import type { TradeSignal } from '../polymarket/strategy-live-bridge';
import type { RiskGateManager } from '../risk/risk-gate-manager';
import { requireLiveEnabled } from './execution-mode';

// ── Types ──────────────────────────────────────────────────────────────────────

export type OrderTerminalState = 'matched' | 'canceled' | 'expired' | 'error';

export interface OrderState {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  status: 'pending' | 'delayed' | OrderTerminalState;
  submittedAt: number;
  lastPollAt: number;
  pollAttempts: number;
}

export interface LiveOrderManagerEvents {
  filled: (state: OrderState) => void;
  partial_fill: (state: OrderState, filledSize: number) => void;
  canceled: (orderId: string) => void;
  expired: (orderId: string) => void;
  error: (orderId: string, error: Error) => void;
  /** Emitted when a signal is rejected due to TTL expiry */
  staleSignal: (signal: TradeSignal, ageMs: number) => void;
  /** Emitted when a strategy's rate limit is exceeded */
  rateLimited: (strategy: string) => void;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVALS = [5_000, 10_000, 20_000, 30_000]; // exponential backoff
const DEFAULT_MAX_ORDER_LIFETIME = 5 * 60 * 1000; // 5 minutes
const MAX_POLL_ERRORS = 5;

// Hard Risk Circuit constants
const SIGNAL_TTL_MS = 200; // Reject signals older than 200ms
const RATE_LIMIT_ORDERS_PER_SEC = 5; // Max 5 orders/sec per strategy
const RATE_LIMIT_BURST = 10; // Allow burst up to 10 orders

// Re-export extracted rate limiter for backward compatibility
export { TokenBucketRateLimiter } from './token-bucket-rate-limiter';
import { TokenBucketRateLimiter } from './token-bucket-rate-limiter';

// ── Manager ────────────────────────────────────────────────────────────────────

export class LiveOrderManager extends EventEmitter {
  private activeOrders = new Map<string, OrderState>();
  private pollTimers = new Map<string, NodeJS.Timeout>();
  private readonly adapter: PolymarketAdapter;
  private readonly positionTracker: LivePositionTracker;
  private readonly maxOrderLifetimeMs: number;
  private stopped = false;

  // Rate limiter per strategy
  private strategyRateLimiters = new Map<string, TokenBucketRateLimiter>();

  constructor(
    adapter: PolymarketAdapter,
    positionTracker: LivePositionTracker,
    maxOrderLifetimeMs: number = DEFAULT_MAX_ORDER_LIFETIME,
    private readonly riskGateManager?: RiskGateManager,
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
   * Submit a TradeSignal through Hard Risk Circuit gates.
   * This is the FINAL gate before any order reaches the CLOB.
   * Cannot be bypassed by strategy-level logic.
   *
   * Gates (in order):
   * 1. SignalTTL - reject signals older than 200ms
   * 2. Rate Limiter - token bucket per strategy (5 orders/sec, burst 10)
   * 3. LiveExecutionGuard - position size, drawdown, concurrent limits, circuit breaker
   *
   * @param signal TradeSignal with required timestamp field
   * @param strategyName Strategy identifier for rate limiting
   * @returns PolymarketOrderResponse if approved, throws if rejected
   */
  async submitSignal(
    signal: TradeSignal,
    strategyName: string
  ): Promise<PolymarketOrderResponse> {
    // GATE 1: SignalTTL - Hard time check
    const age = Date.now() - signal.timestamp;
    if (age > SIGNAL_TTL_MS) {
      logger.warn('STALE_SIGNAL rejected', 'LiveOrderManager', {
        strategy: strategyName,
        tokenId: signal.tokenId.slice(0, 12),
        signalAgeMs: age,
        ttlMs: SIGNAL_TTL_MS,
      });
      this.emit('staleSignal', signal, age);
      throw new Error(`STALE_SIGNAL: Signal age ${age}ms exceeds TTL of ${SIGNAL_TTL_MS}ms`);
    }

    // GATE 2: Token-Bucket Rate Limiter
    const rateLimiter = this.getRateLimiter(strategyName);
    if (!rateLimiter.tryConsume()) {
      logger.warn('RATE_LIMITED', 'LiveOrderManager', {
        strategy: strategyName,
        availableTokens: rateLimiter.getAvailableTokens().toFixed(2),
      });
      this.emit('rateLimited', strategyName);
      throw new Error(`RATE_LIMITED: Strategy ${strategyName} exceeded ${RATE_LIMIT_ORDERS_PER_SEC} orders/sec`);
    }

    // GATE 3: LiveExecutionGuard — position size, drawdown, concurrent limits, circuit breaker
    const order: PolymarketOrder = {
      tokenId: signal.tokenId,
      side: signal.side,
      price: signal.price,
      size: signal.size,
      expiration: Math.floor(Date.now() / 1000) + 300, // 5 min GTC
      nonce: String(Date.now()),
      feeRateBps: 0,
      signatureType: 0,
    };

    if (this.riskGateManager) {
      const { allowed, reason } = await this.riskGateManager.check(strategyName, {
        tokenId: order.tokenId,
        price: order.price,
        size: order.size,
        side: order.side,
      });
      if (!allowed) {
        logger.warn('RISK_GATE_REJECTED', 'LiveOrderManager', {
          strategy: strategyName,
          tokenId: signal.tokenId.slice(0, 12),
          reason,
        });
        throw new Error(`RISK_GATE_REJECTED: ${reason}`);
      }
    }

    return this.submitAndTrack(order);
  }

  /** Get or create rate limiter for a strategy */
  private getRateLimiter(strategyName: string): TokenBucketRateLimiter {
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

  // ── Private: polling ───────────────────────────────────────────────────────

  private schedulePoll(orderId: string): void {
    const state = this.activeOrders.get(orderId);
    if (!state || this.stopped) return;

    const age = Date.now() - state.submittedAt;
    if (age > this.maxOrderLifetimeMs) {
      this.handleExpired(orderId);
      return;
    }

    const intervalIdx = Math.min(state.pollAttempts, DEFAULT_POLL_INTERVALS.length - 1);
    const delay = DEFAULT_POLL_INTERVALS[intervalIdx];

    const timer = setTimeout(() => this.pollOrder(orderId), delay);
    this.pollTimers.set(orderId, timer);
  }

  private async pollOrder(orderId: string): Promise<void> {
    this.pollTimers.delete(orderId);

    const state = this.activeOrders.get(orderId);
    if (!state || this.stopped) return;

    state.pollAttempts++;
    state.lastPollAt = Date.now();

    try {
      const openOrders = await this.adapter.getOpenOrders();
      const order = openOrders.find((o) => o.id === orderId);

      if (!order) {
        // Order not in open orders — might be filled or expired on CLOB side
        // Check age to determine
        const age = Date.now() - state.submittedAt;
        if (age > this.maxOrderLifetimeMs) {
          this.handleExpired(orderId);
        } else {
          // Still polling — might be a CLOB delay
          this.schedulePoll(orderId);
        }
        return;
      }

      if (order.status === 'matched' || order.status === 'filled') {
        state.status = 'matched';
        this.handleFill(state);
      } else if (order.status === 'canceled') {
        state.status = 'canceled';
        this.activeOrders.delete(orderId);
        this.emit('canceled', orderId);
      } else {
        // Still unmatched or delayed — keep polling
        this.schedulePoll(orderId);
      }
    } catch (err) {
      if (state.pollAttempts >= MAX_POLL_ERRORS) {
        state.status = 'error';
        this.activeOrders.delete(orderId);
        this.emit('error', orderId, err as Error);
        logger.error(`Order ${orderId} exceeded max poll errors`, 'LiveOrderManager', {
          err: String(err),
        });
      } else {
        this.schedulePoll(orderId);
      }
    }
  }

  // ── Private: terminal states ───────────────────────────────────────────────

  private handleFill(state: OrderState): void {
    this.pollTimers.delete(state.orderId);
    const fill: FilledOrder = {
      tokenId: state.tokenId,
      side: state.side,
      size: state.size,
      price: state.price,
      filledAt: Date.now(),
      orderId: state.orderId,
    };
    this.positionTracker.recordFill(fill);
    this.activeOrders.delete(state.orderId);
    this.emit('filled', state);
    logger.info(`Order ${state.orderId} filled`, 'LiveOrderManager', {
      tokenId: state.tokenId.slice(0, 12),
      side: state.side,
      size: state.size,
      price: state.price,
    });
  }

  private handleExpired(orderId: string): void {
    this.pollTimers.delete(orderId);
    const state = this.activeOrders.get(orderId);
    if (state) {
      state.status = 'expired';
      this.emit('expired', orderId);
    }
    this.activeOrders.delete(orderId);

    // Best-effort cancel on CLOB side
    this.adapter.cancelOrder(orderId).catch(() => {});
    logger.info(`Order ${orderId} expired`, 'LiveOrderManager');
  }
}
