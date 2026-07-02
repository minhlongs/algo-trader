/**
 * Risk Gate Manager
 *
 * Orchestrator-facing risk wrapper that sits between strategy tick functions
 * and the execution layer. Composes existing risk infra — does NOT rewrite it.
 *
 * - Delegates position-size, drawdown, and concurrent-position checks to
 *   LiveExecutionGuard (the LAST line of defense before the CLOB).
 * - Delegates circuit-state checks to CircuitBreaker (Redis-backed).
 *
 * Usage (pre-tick gate):
 *   const { allowed, reason } = await riskManager.check(strategyKey);
 *   if (!allowed) { / * skip tick * / }
 *
 * Usage (pre-order gate — from strategy code):
 *   const { allowed, reason } = await riskManager.check(strategyKey, order);
 *   if (!allowed) { / * skip order * / }
 */

import type { LiveExecutionGuard } from '../execution/live-execution-guard';
import type { CircuitBreaker } from './circuit-breaker';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Simplified trade order for risk gate evaluation (subset of PolymarketOrder) */
export interface TradeOrder {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

// ── Manager ────────────────────────────────────────────────────────────────────

export class RiskGateManager {
  constructor(
    private readonly guard: LiveExecutionGuard,
    private readonly circuitBreaker?: CircuitBreaker,
  ) {}

  /**
   * Check whether a strategy is allowed to trade.
   *
   * When an `order` is provided, performs a full 4-check gate:
   *   1. Circuit-breaker state  (—> CircuitBreaker)
   *   2. Position size vs maxFraction  (—> LiveExecutionGuard)
   *   3. Daily drawdown limit  (—> LiveExecutionGuard)
   *   4. Concurrent-position limit  (—> LiveExecutionGuard)
   *
   * When `order` is omitted, checks only global conditions (circuit breaker +
   * drawdown + concurrent positions) — useful as a pre-tick gate.
   *
   * @param strategyKey — unique strategy identifier (e.g. 'vwap-sniper')
   * @param order       — optional trade order for per-order position-size check
   */
  async check(strategyKey: string, order?: TradeOrder): Promise<GateResult> {
    const prefix = `[${strategyKey}]`;

    // 1. Circuit breaker check (async, Redis-backed)
    if (this.circuitBreaker) {
      const canTrade = await this.circuitBreaker.canTrade();
      if (!canTrade) {
        const status = await this.circuitBreaker.getStatus();
        const reason =
          `Circuit breaker ${status.state}` +
          (status.reason ? `: ${status.reason}` : '');
        logger.warn(`${prefix} ${reason}`, 'RiskGateManager');
        return { allowed: false, reason: `${prefix} ${reason}` };
      }
    }

    // 2. Global guard status: drawdown + concurrent positions
    const guardStatus = this.guard.getStatus();
    const capitalUsdc = this.guard.getConfig().capitalUsdc;
    const maxDrawdown = this.guard.getConfig().maxDailyDrawdown;

    // Daily drawdown
    const drawdownFraction =
      capitalUsdc > 0
        ? Math.abs(Math.min(0, guardStatus.dailyPnl)) / capitalUsdc
        : 0;
    if (drawdownFraction >= maxDrawdown) {
      const reason = `Daily drawdown ${(drawdownFraction * 100).toFixed(1)}% exceeds limit ${(maxDrawdown * 100).toFixed(0)}%`;
      logger.warn(`${prefix} ${reason}`, 'RiskGateManager');
      return { allowed: false, reason: `${prefix} ${reason}` };
    }

    // Concurrent positions
    const maxPositions = this.guard.getConfig().maxConcurrentPositions;
    if (guardStatus.openPositions >= maxPositions) {
      const reason = `Open positions (${guardStatus.openPositions}) at max (${maxPositions})`;
      logger.warn(`${prefix} ${reason}`, 'RiskGateManager');
      return { allowed: false, reason: `${prefix} ${reason}` };
    }

    // 3. Position-size check (only when an order is provided)
    if (order) {
      const polyOrder: PolymarketOrder = {
        tokenId: order.tokenId,
        price: order.price,
        size: order.size,
        side: order.side,
        expiration: 0,
        nonce: '',
        feeRateBps: 0,
        signatureType: 0,
      };
      const result = this.guard.guardOrder(polyOrder);
      if (!result.approved) {
        logger.warn(`${prefix} ${result.reason}`, 'RiskGateManager');
        return { allowed: false, reason: `${prefix} ${result.reason}` };
      }
    }

    return { allowed: true };
  }

  /** Access the underlying guard (for status queries, reset, etc.) */
  getGuard(): LiveExecutionGuard {
    return this.guard;
  }
}
