/**
 * Compensatory unwind handler for broken or partially filled multi-leg arbitrage.
 *
 * Liquidates or hedges unhedged leg positions to prevent naked directional delta exposure.
 * Supports automated retry with exponential backoff and fallback to emergency liquidation.
 *
 * @module desk/arbitrage/compensatory-unwind-handler
 */

import { EventEmitter } from 'node:events';
import { logger } from '../../shared/utils/logger';
import type { IExchangeConnector } from './connectors/types';
import {
  type CompensatoryUnwindRequest,
  type UnwindResult,
  type UnwindLegTarget,
  type LegExecutionReport,
  type LegSide,
  CompensatoryUnwindRequestSchema,
  UnwindResultSchema,
} from './execution-types';

export interface UnwindHandlerConfig {
  /** Maximum retry attempts for failed unwinds (default: 3) */
  maxRetries?: number;
  /** Initial backoff duration in ms before first retry (default: 20ms) */
  initialBackoffMs?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to attempt emergency market liquidation on final attempt (default: true) */
  emergencyFallback?: boolean;
}

export type ConnectorResolver = (venue: string) => IExchangeConnector | undefined;

export interface UnwindEventPayload {
  unwindId: string;
  executionId: string;
  legId: string;
  venue: string;
  symbol: string;
  side: LegSide;
  amount: number;
  attempt?: number;
  error?: string;
  latencyMs?: number;
}

export class CompensatoryUnwindHandler extends EventEmitter {
  private readonly config: Required<UnwindHandlerConfig>;

  constructor(
    private readonly connectorResolver: ConnectorResolver,
    config?: UnwindHandlerConfig,
  ) {
    super();
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      initialBackoffMs: config?.initialBackoffMs ?? 20,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
      emergencyFallback: config?.emergencyFallback ?? true,
    };
  }

  /**
   * Execute compensatory unwinds for unhedged leg positions.
   * Overloaded to accept both structured request and legacy (executionId, legs) arguments.
   */
  async executeUnwind(
    requestOrExecutionId: CompensatoryUnwindRequest | string,
    legacyLegs?: Array<LegExecutionReport | UnwindLegTarget>,
    legacyReason?: string,
  ): Promise<UnwindResult> {
    const startTime = Date.now();
    let request: CompensatoryUnwindRequest;

    if (typeof requestOrExecutionId === 'string') {
      const targets: UnwindLegTarget[] = [];
      for (const leg of legacyLegs ?? []) {
        if (leg.filledAmount > 0) {
          targets.push({
            legId: leg.legId,
            venue: leg.venue,
            symbol: leg.symbol,
            side: leg.side,
            filledAmount: leg.filledAmount,
            entryPrice: 'avgFillPrice' in leg && leg.avgFillPrice ? leg.avgFillPrice : ('entryPrice' in leg ? leg.entryPrice : leg.price),
            orderId: leg.orderId,
          });
        }
      }

      request = {
        unwindId: `unwind-${requestOrExecutionId}-${Date.now()}`,
        executionId: requestOrExecutionId,
        legsToUnwind: targets,
        reason: legacyReason ?? 'Compensatory unwind triggered',
        maxRetries: this.config.maxRetries,
      };
    } else {
      request = requestOrExecutionId;
      if (!request.unwindId) {
        request.unwindId = `unwind-${request.executionId}-${Date.now()}`;
      }
    }

    // Validate request schema
    CompensatoryUnwindRequestSchema.parse(request);
    const unwindId = request.unwindId!;
    const maxRetries = request.maxRetries ?? this.config.maxRetries;

    logger.warn('[CompensatoryUnwindHandler] Initiating compensatory unwind sequence', {
      unwindId,
      executionId: request.executionId,
      targetsCount: request.legsToUnwind.length,
      reason: request.reason,
    });

    this.emit('unwind:started', {
      unwindId,
      executionId: request.executionId,
      targetsCount: request.legsToUnwind.length,
    });

    const unwoundLegs: LegExecutionReport[] = [];
    let totalRealizedLossUsd = 0;
    let unhedgedResidualDelta = 0;
    let totalAttempts = 0;
    let lastError: string | undefined;

    for (const target of request.legsToUnwind) {
      if (target.filledAmount <= 0) {
        continue;
      }

      const connector = this.connectorResolver(target.venue);
      if (!connector) {
        const errorMsg = `No connector registered for venue "${target.venue}"`;
        logger.error('[CompensatoryUnwindHandler] Connector missing for unwind target', {
          unwindId,
          venue: target.venue,
          legId: target.legId,
        });

        unhedgedResidualDelta += target.filledAmount;
        lastError = errorMsg;

        unwoundLegs.push({
          legId: `unwind-${target.legId}`,
          venue: target.venue,
          symbol: target.symbol,
          side: target.side === 'buy' ? 'sell' : 'buy',
          requestedAmount: target.filledAmount,
          filledAmount: 0,
          remainingAmount: target.filledAmount,
          price: target.entryPrice,
          status: 'failed',
          latencyMs: Date.now() - startTime,
          error: errorMsg,
        });

        this.emit('unwind:failed', {
          unwindId,
          executionId: request.executionId,
          legId: target.legId,
          venue: target.venue,
          symbol: target.symbol,
          side: target.side === 'buy' ? 'sell' : 'buy',
          amount: target.filledAmount,
          error: errorMsg,
        });
        continue;
      }

      // Reverse order: if we bought, we sell to unwind; if we sold, we buy to cover.
      const unwindSide: LegSide = target.side === 'buy' ? 'sell' : 'buy';
      let remainingToUnwind = target.filledAmount;
      let legFilled = 0;
      let legAttempts = 0;
      let legSuccess = false;
      let backoffMs = this.config.initialBackoffMs;

      while (legAttempts <= maxRetries && remainingToUnwind > 0) {
        totalAttempts++;
        legAttempts++;
        const legStart = Date.now();
        const isEmergency = legAttempts > maxRetries && this.config.emergencyFallback;

        const clientOrderId = isEmergency
          ? `emergency-unwind-${unwindId}-${target.legId}-${legAttempts}`
          : `unwind-${unwindId}-${target.legId}-${legAttempts}`;

        try {
          if (legAttempts > 1) {
            logger.warn('[CompensatoryUnwindHandler] Retrying compensatory unwind with backoff', {
              unwindId,
              legId: target.legId,
              attempt: legAttempts,
              backoffMs,
            });
            this.emit('unwind:retry', {
              unwindId,
              executionId: request.executionId,
              legId: target.legId,
              venue: target.venue,
              symbol: target.symbol,
              side: unwindSide,
              amount: remainingToUnwind,
              attempt: legAttempts,
            });
            await this.sleep(backoffMs);
            backoffMs *= this.config.backoffMultiplier;
          }

          const orderResult = await connector.placeOrder({
            symbol: target.symbol,
            side: unwindSide,
            type: 'market',
            amount: remainingToUnwind,
            clientOrderId,
          });

          const fillAmount = orderResult.filled > 0
            ? orderResult.filled
            : (orderResult.status === 'closed' ? remainingToUnwind : 0);

          legFilled += fillAmount;
          remainingToUnwind = Math.max(0, remainingToUnwind - fillAmount);

          // Calculate realized loss for this liquidation slice
          const execPrice = orderResult.price > 0 ? orderResult.price : target.entryPrice;
          const feeUsd = orderResult.fee ? orderResult.fee.amount : 0;
          let legLoss = 0;
          if (target.side === 'buy') {
            // Bought at entryPrice, selling at execPrice
            legLoss = Math.max(0, (target.entryPrice - execPrice) * fillAmount) + feeUsd;
          } else {
            // Sold at entryPrice, buying back at execPrice
            legLoss = Math.max(0, (execPrice - target.entryPrice) * fillAmount) + feeUsd;
          }
          totalRealizedLossUsd += legLoss;

          const latencyMs = Date.now() - legStart;

          unwoundLegs.push({
            legId: `unwind-${target.legId}`,
            orderId: orderResult.orderId,
            clientOrderId,
            venue: target.venue,
            symbol: target.symbol,
            side: unwindSide,
            requestedAmount: target.filledAmount,
            filledAmount: legFilled,
            remainingAmount: remainingToUnwind,
            price: execPrice,
            avgFillPrice: execPrice,
            status: remainingToUnwind === 0 ? 'filled' : 'partial',
            fee: orderResult.fee,
            latencyMs,
          });

          if (remainingToUnwind === 0) {
            legSuccess = true;
            logger.info('[CompensatoryUnwindHandler] Unwind leg closed successfully', {
              unwindId,
              legId: target.legId,
              unwoundAmount: legFilled,
              realizedLossUsd: legLoss,
            });

            this.emit('unwind:success', {
              unwindId,
              executionId: request.executionId,
              legId: target.legId,
              venue: target.venue,
              symbol: target.symbol,
              side: unwindSide,
              amount: legFilled,
              latencyMs,
            });
            break;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          lastError = errMsg;
          logger.warn('[CompensatoryUnwindHandler] Unwind attempt failed', {
            unwindId,
            legId: target.legId,
            attempt: legAttempts,
            error: errMsg,
          });
        }
      }

      if (!legSuccess && remainingToUnwind > 0) {
        unhedgedResidualDelta += remainingToUnwind;
        logger.error('[CompensatoryUnwindHandler] Unwind exhausted retries — residual delta remains', {
          unwindId,
          legId: target.legId,
          residualDelta: remainingToUnwind,
          attempts: legAttempts,
          error: lastError,
        });

        this.emit('unwind:escalated', {
          unwindId,
          executionId: request.executionId,
          legId: target.legId,
          venue: target.venue,
          symbol: target.symbol,
          side: unwindSide,
          amount: remainingToUnwind,
          error: lastError,
        });
      }
    }

    const overallSuccess = unhedgedResidualDelta === 0;

    const result: UnwindResult = {
      unwindId,
      success: overallSuccess,
      unwoundLegs,
      unhedgedResidualDelta,
      totalRealizedLossUsd: Number(totalRealizedLossUsd.toFixed(4)),
      unwindCostUsd: Number(totalRealizedLossUsd.toFixed(4)),
      attempts: totalAttempts,
      error: overallSuccess ? undefined : (lastError ?? 'Residual unhedged delta remains'),
      timestamp: Date.now(),
    };

    UnwindResultSchema.parse(result);

    this.emit('unwind:complete', {
      unwindId,
      success: overallSuccess,
      residualDelta: unhedgedResidualDelta,
    });

    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
