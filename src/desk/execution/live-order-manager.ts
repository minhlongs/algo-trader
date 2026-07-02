/**
 * Live Order Manager
 *
 * Order lifecycle management for live Polymarket CLOB trading.
 * Submit signed orders → poll for fill status with exponential backoff →
 * confirm fills → record in position tracker.
 *
 * Uses REST polling (no WebSocket — Polymarket CLOB WebSocket is undocumented).
 * Orders auto-expire after maxOrderLifetimeMs (default 5 minutes).
 */

import { EventEmitter } from 'events';
import type { PolymarketAdapter, PolymarketOrderResponse } from './polymarket-adapter';
import type { PolymarketOrder } from './polymarket-signer';
import type { LivePositionTracker, FilledOrder } from './live-position-tracker';
import { logger } from '../../shared/utils/logger';

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
}

// ── Config ─────────────────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVALS = [5_000, 10_000, 20_000, 30_000]; // exponential backoff
const DEFAULT_MAX_ORDER_LIFETIME = 5 * 60 * 1000; // 5 minutes
const MAX_POLL_ERRORS = 5;

// ── Manager ────────────────────────────────────────────────────────────────────

export class LiveOrderManager extends EventEmitter {
  private activeOrders = new Map<string, OrderState>();
  private pollTimers = new Map<string, NodeJS.Timeout>();
  private readonly adapter: PolymarketAdapter;
  private readonly positionTracker: LivePositionTracker;
  private readonly maxOrderLifetimeMs: number;
  private stopped = false;

  constructor(
    adapter: PolymarketAdapter,
    positionTracker: LivePositionTracker,
    maxOrderLifetimeMs: number = DEFAULT_MAX_ORDER_LIFETIME,
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
