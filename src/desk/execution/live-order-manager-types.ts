/**
 * Live Order Manager — Types & Structural Context
 *
 * Extracted from live-order-manager.ts. Defines all public types, constants,
 * and the structural interface (LiveOrderManagerCtx) that leaf modules use
 * to operate on the facade instance via `.call(this)` delegation.
 *
 * Using public readonly fields (not private) enables structural assignability
 * without importing the facade class — avoids facade→leaf→facade cycle.
 */

import type { PolymarketAdapter, PolymarketOrderResponse } from './polymarket-adapter';
import type { PolymarketOrder } from './polymarket-signer';
import type { LivePositionTracker, FilledOrder } from './live-position-tracker';
import type { TradeSignal } from '../polymarket/strategy-live-bridge';
import type { RiskGateManager } from '../risk/risk-gate-manager';

// ── Public Types ────────────────────────────────────────────────────────────────

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

// ── Config Constants ────────────────────────────────────────────────────────────

export const DEFAULT_POLL_INTERVALS = [5_000, 10_000, 20_000, 30_000]; // exponential backoff
export const DEFAULT_MAX_ORDER_LIFETIME = 5 * 60 * 1000; // 5 minutes
export const MAX_POLL_ERRORS = 5;

// Hard Risk Circuit constants
export const SIGNAL_TTL_MS = 200; // Reject signals older than 200ms
export const RATE_LIMIT_ORDERS_PER_SEC = 5; // Max 5 orders/sec per strategy
export const RATE_LIMIT_BURST = 10; // Allow burst up to 10 orders

// ── Structural Context Interface ────────────────────────────────────────────────

/**
 * Structural interface the LiveOrderManager facade must satisfy.
 *
 * Declared here (not in the class module) so leaf modules can type their
 * `this` / `ctx` parameter without a circular runtime import.
 * The facade class implements these fields/methods directly.
 *
 * Fields are PUBLIC and READONLY where possible — this is required for
 * structural assignability (private blocks structural typing).
 */
export interface LiveOrderManagerCtx {
  // State maps (public for structural access)
  activeOrders: Map<string, OrderState>;
  pollTimers: Map<string, NodeJS.Timeout>;

  // Injected dependencies (readonly — set once in constructor)
  readonly adapter: PolymarketAdapter;
  readonly positionTracker: LivePositionTracker;
  readonly maxOrderLifetimeMs: number;

  // Lifecycle flag
  stopped: boolean;

  // Optional risk gate manager
  readonly riskGateManager?: RiskGateManager;

  // Per-strategy rate limiters
  strategyRateLimiters: Map<string, TokenBucketRateLimiter>;

  // EventEmitter.emit — typed for our events
  emit(event: 'filled' | 'partial_fill' | 'canceled' | 'expired' | 'error' | 'staleSignal' | 'rateLimited', ...args: unknown[]): boolean;

  // Methods leaf modules need to call
  submitAndTrack(order: PolymarketOrder): Promise<PolymarketOrderResponse>;
  getRateLimiter(strategyName: string): TokenBucketRateLimiter;
}

// ── Forward declaration for structural interface ────────────────────────────────

import { TokenBucketRateLimiter } from './token-bucket-rate-limiter';