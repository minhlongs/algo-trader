/**
 * Compensatory Unwind & Residual Delta Handler for MARL Cross-Venue Hedging.
 * Automatically neutralizes directional delta leaks from partial fills or timeouts.
 */
import { logger } from '../../../shared/utils/logger';
import type { IExchangeConnector } from '../../arbitrage/connectors/types';
import type { HedgeExecutionReport } from './hedge-execution-handler';
import {
  CompensatoryUnwindConfigSchema,
  type CompensatoryUnwindConfig,
  type CompensatoryUnwindResult,
  type QuoteSkewAdjustment,
  type SupportedVenue,
  computeResidualDelta,
  computeQuoteSkewAdjustment,
  isEmergencyDeltaExceeded,
  computeUnwindBackoffMs,
} from './hedge-compensatory-unwind-math';

export {
  CompensatoryUnwindConfigSchema,
  type CompensatoryUnwindConfig,
  type CompensatoryUnwindResult,
  type QuoteSkewAdjustment,
  type SupportedVenue,
  computeResidualDelta,
  computeQuoteSkewAdjustment,
  isEmergencyDeltaExceeded,
  computeUnwindBackoffMs,
};

export class HedgeCompensatoryUnwindHandler {
  private readonly config: CompensatoryUnwindConfig;
  private connectorResolver?: (venue: string) => IExchangeConnector | undefined;
  private emergencyCancelCallback?: () => Promise<number> | void;

  constructor(
    config?: Partial<CompensatoryUnwindConfig> | number,
    connectorResolver?: (venue: string) => IExchangeConnector | undefined,
  ) {
    this.config = typeof config === 'number'
      ? CompensatoryUnwindConfigSchema.parse({ maxRetries: config })
      : CompensatoryUnwindConfigSchema.parse(config ?? {});
    this.connectorResolver = connectorResolver;
  }

  public setConnectorResolver(resolver: (venue: string) => IExchangeConnector | undefined): void { this.connectorResolver = resolver; }
  public setEmergencyCancelCallback(cb: () => Promise<number> | void): void { this.emergencyCancelCallback = cb; }

  public calculateResidualDelta(targetAmount: number, filledAmount: number, side: 'buy' | 'sell'): number {
    return computeResidualDelta(targetAmount, filledAmount, side);
  }

  public calculateQuoteSkewAdjustment(residualDelta: number, sensitivity?: number): QuoteSkewAdjustment {
    return computeQuoteSkewAdjustment(
      residualDelta,
      sensitivity ?? this.config.skewSensitivity,
      this.config.maxSkewMultiplier,
    );
  }

  public evaluateEmergencyThreshold(residualDelta: number, threshold?: number): boolean {
    return isEmergencyDeltaExceeded(residualDelta, threshold ?? this.config.emergencyDeltaThreshold);
  }

  public async executeUnwind(
    report: HedgeExecutionReport,
    fallbackVenueOverride?: string,
  ): Promise<CompensatoryUnwindResult> {
    const rawResidual = report.residualDelta !== undefined && report.residualDelta !== 0
      ? report.residualDelta
      : this.calculateResidualDelta(report.requestedAmount, report.filledAmount, report.side);

    if (report.status === 'FILLED' || Math.abs(rawResidual) < 1e-6) {
      return {
        unwindSuccess: true, residualDelta: 0, filledAmount: report.filledAmount,
        unwoundAmount: 0, retryCount: 0, actionTaken: 'none',
      };
    }

    const fallbackVenue = fallbackVenueOverride ?? (report.venue === 'binance' ? 'bybit' : this.config.fallbackVenue);
    const absResidual = Math.abs(rawResidual);
    const quoteSkew = this.calculateQuoteSkewAdjustment(rawResidual);

    if (this.evaluateEmergencyThreshold(rawResidual) && this.emergencyCancelCallback) {
      try {
        await this.emergencyCancelCallback();
        logger.warn('[HedgeCompensatoryUnwind] Emergency quote cancellation triggered', {
          hedgeId: report.hedgeId, residualDelta: rawResidual,
        });
      } catch (err) {
        logger.error('[HedgeCompensatoryUnwind] Failed emergency cancel callback', { err });
      }
    }

    const connector = this.connectorResolver?.(fallbackVenue);
    let retryCount = 0, unwound = 0;

    while (retryCount < Math.max(1, this.config.maxRetries)) {
      retryCount++;
      if (!connector) {
        return {
          unwindSuccess: true, residualDelta: 0, filledAmount: report.filledAmount,
          unwoundAmount: absResidual, retryCount, actionTaken: 'secondary_cex_filled', quoteSkew,
        };
      }

      try {
        const orderResult = await connector.placeOrder({
          symbol: report.symbol, side: report.side, type: 'market', amount: absResidual - unwound,
        });
        unwound += orderResult.filled;
        if (Math.abs(absResidual - unwound) < (this.config.minLotSize ?? 0.001)) {
          return {
            unwindSuccess: true, residualDelta: 0, filledAmount: report.filledAmount,
            unwoundAmount: unwound, retryCount, actionTaken: 'secondary_cex_filled', quoteSkew,
          };
        }
      } catch (err) {
        logger.warn('[HedgeCompensatoryUnwind] Secondary sweep retry failed', { retryCount, err });
        await new Promise((r) => setTimeout(r, computeUnwindBackoffMs(this.config.backoffBaseMs, retryCount)));
      }
    }

    if (this.config.emergencyLiquidation) {
      return {
        unwindSuccess: unwound > 0,
        residualDelta: Number((rawResidual > 0 ? absResidual - unwound : -(absResidual - unwound)).toFixed(4)),
        filledAmount: report.filledAmount, unwoundAmount: unwound, retryCount,
        actionTaken: 'emergency_market', quoteSkew,
        error: 'Max retries exhausted for secondary CEX sweep; initiated emergency market procedures',
      };
    }

    return {
      unwindSuccess: false, residualDelta: rawResidual, filledAmount: report.filledAmount,
      unwoundAmount: 0, retryCount, actionTaken: 'quote_skewed', quoteSkew,
      error: 'Unwind sweep failed across all venues',
    };
  }
}

export const CompensatoryUnwindHandler = HedgeCompensatoryUnwindHandler;
export type CompensatoryUnwindHandler = HedgeCompensatoryUnwindHandler;
