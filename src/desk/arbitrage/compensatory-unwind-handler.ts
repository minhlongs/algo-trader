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
import type {
  CompensatoryUnwindRequest,
  UnwindResult,
  UnwindLegTarget,
  LegExecutionReport,
} from './execution-types';
import type {
  UnwindHandlerConfig,
  ConnectorResolver,
  UnwindEventPayload,
} from './execution/compensatory-unwind-types';
import {
  normalizeUnwindRequest,
  buildUnwindResult,
} from './execution/compensatory-unwind-parser';
import { executeSingleLegUnwind } from './execution/compensatory-unwind-leg';

export * from './execution-types';
export type {
  UnwindHandlerConfig,
  ConnectorResolver,
  UnwindEventPayload,
} from './execution/compensatory-unwind-types';

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
    const request = normalizeUnwindRequest(
      requestOrExecutionId,
      legacyLegs,
      legacyReason,
      this.config.maxRetries,
    );
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

    const allUnwoundLegs: LegExecutionReport[] = [];
    let totalRealizedLossUsd = 0;
    let unhedgedResidualDelta = 0;
    let totalAttempts = 0;
    let lastError: string | undefined;

    const ctx = {
      emitter: this,
      config: this.config,
      connectorResolver: this.connectorResolver,
      unwindId,
      executionId: request.executionId,
      startTime,
    };

    for (const target of request.legsToUnwind) {
      if (target.filledAmount <= 0) continue;

      const outcome = await executeSingleLegUnwind(target, ctx, maxRetries);
      allUnwoundLegs.push(...outcome.unwoundLegs);
      totalRealizedLossUsd += outcome.realizedLossUsd;
      unhedgedResidualDelta += outcome.residualDelta;
      totalAttempts += outcome.attempts;
      if (outcome.error) lastError = outcome.error;
    }

    const result = buildUnwindResult({
      unwindId,
      unwoundLegs: allUnwoundLegs,
      unhedgedResidualDelta,
      totalRealizedLossUsd,
      totalAttempts,
      lastError,
    });

    this.emit('unwind:complete', {
      unwindId,
      success: result.success,
      residualDelta: unhedgedResidualDelta,
    });

    return result;
  }
}
