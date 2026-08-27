/**
 * Live Order Manager — Hard Risk Circuit Gate Chain
 *
 * Extracted from live-order-manager.ts submitSignal(). Runs the final gate
 * chain before any order reaches the CLOB. Cannot be bypassed by
 * strategy-level logic.
 *
 * GATE ORDER MUST BE PRESERVED EXACTLY:
 * 1. SignalTTL — reject signals older than 200ms
 * 2. Rate Limiter — token bucket per strategy (5 orders/sec, burst 10)
 * 3. LiveExecutionGuard — position size, drawdown, concurrent limits, circuit breaker
 * then submitAndTrack.
 */

import { logger } from '../../shared/utils/logger';
import type { PolymarketOrderResponse } from './polymarket-adapter';
import type { PolymarketOrder } from './polymarket-signer';
import type { TradeSignal } from '../polymarket/strategy-live-bridge';
import type { LiveOrderManagerCtx } from './live-order-manager-types';
import { SIGNAL_TTL_MS, RATE_LIMIT_ORDERS_PER_SEC } from './live-order-manager-types';

/**
 * Submit a TradeSignal through Hard Risk Circuit gates.
 * This is the FINAL gate before any order reaches the CLOB.
 *
 * @param signal TradeSignal with required timestamp field
 * @param strategyName Strategy identifier for rate limiting
 * @param ctx Structural LiveOrderManager context (the facade instance)
 * @returns PolymarketOrderResponse if approved, throws if rejected
 */
export async function runRiskGates(
  signal: TradeSignal,
  strategyName: string,
  ctx: LiveOrderManagerCtx,
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
    ctx.emit('staleSignal', signal, age);
    throw new Error(`STALE_SIGNAL: Signal age ${age}ms exceeds TTL of ${SIGNAL_TTL_MS}ms`);
  }

  // GATE 2: Token-Bucket Rate Limiter
  const rateLimiter = ctx.getRateLimiter(strategyName);
  if (!rateLimiter.tryConsume()) {
    logger.warn('RATE_LIMITED', 'LiveOrderManager', {
      strategy: strategyName,
      availableTokens: rateLimiter.getAvailableTokens().toFixed(2),
    });
    ctx.emit('rateLimited', strategyName);
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

  if (ctx.riskGateManager) {
    const { allowed, reason } = await ctx.riskGateManager.check(strategyName, {
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

  return ctx.submitAndTrack(order);
}