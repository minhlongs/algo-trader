/**
 * Compensatory unwind handler for broken or partially filled multi-leg arbitrage.
 *
 * Liquidates or hedges unhedged leg positions to prevent naked directional delta exposure.
 *
 * @module desk/arbitrage/execution/compensatory-unwind-handler
 */

import { logger } from '../../../shared/utils/logger';
import type { IExchangeConnector } from '../connectors/types';
import type { LegExecutionRecord, UnwindReport } from './atomic-multileg-types';

export class CompensatoryUnwindHandler {
  constructor(
    private readonly connectorResolver: (venue: string) => IExchangeConnector | undefined,
  ) {}

  /**
   * Execute compensatory unwinds for unhedged filled legs.
   */
  async executeUnwind(
    executionId: string,
    legs: LegExecutionRecord[],
  ): Promise<UnwindReport> {
    const unwindId = `unwind-${executionId}-${Date.now()}`;
    const unwoundRecords: LegExecutionRecord[] = [];
    let totalUnwindCost = 0;
    let anyFailure = false;
    let failureError: string | undefined;

    // Identify legs with filled amount > 0 that need liquidation
    for (const leg of legs) {
      if (leg.filledAmount <= 0) continue;

      const connector = this.connectorResolver(leg.venue);
      if (!connector) {
        anyFailure = true;
        failureError = `Connector not found for venue ${leg.venue}`;
        logger.error('[CompensatoryUnwindHandler] Connector missing for unwind', {
          venue: leg.venue,
          legId: leg.legId,
        });
        continue;
      }

      // Opposite side to unwind the inventory
      const unwindSide: 'buy' | 'sell' = leg.side === 'buy' ? 'sell' : 'buy';
      const startTime = Date.now();

      try {
        logger.warn('[CompensatoryUnwindHandler] Executing compensatory unwind order', {
          unwindId,
          venue: leg.venue,
          symbol: leg.symbol,
          side: unwindSide,
          amount: leg.filledAmount,
        });

        const orderResult = await connector.placeOrder({
          symbol: leg.symbol,
          side: unwindSide,
          type: 'market',
          amount: leg.filledAmount,
          clientOrderId: `${unwindId}-${leg.legId}`,
        });

        const unwindLatency = Date.now() - startTime;
        const unwindCost = Math.abs(orderResult.price - leg.price) * orderResult.filled;
        totalUnwindCost += unwindCost;

        unwoundRecords.push({
          legId: `unwind-${leg.legId}`,
          orderId: orderResult.orderId,
          venue: leg.venue,
          symbol: leg.symbol,
          side: unwindSide,
          requestedAmount: leg.filledAmount,
          filledAmount: orderResult.filled,
          price: orderResult.price,
          status: orderResult.status === 'closed' || orderResult.status === 'open' ? 'filled' : 'partial',
          fee: orderResult.fee,
          latencyMs: unwindLatency,
        });
      } catch (err) {
        anyFailure = true;
        const msg = err instanceof Error ? err.message : String(err);
        failureError = msg;
        logger.error('[CompensatoryUnwindHandler] Unwind execution failed', {
          unwindId,
          venue: leg.venue,
          error: msg,
        });

        unwoundRecords.push({
          legId: `unwind-${leg.legId}`,
          venue: leg.venue,
          symbol: leg.symbol,
          side: unwindSide,
          requestedAmount: leg.filledAmount,
          filledAmount: 0,
          price: leg.price,
          status: 'failed',
          latencyMs: Date.now() - startTime,
          error: msg,
        });
      }
    }

    return {
      unwindId,
      success: !anyFailure,
      unwoundLegs: unwoundRecords,
      unwindCostUsd: totalUnwindCost,
      error: failureError,
      timestamp: Date.now(),
    };
  }
}
