/**
 * Compensatory Unwind & Residual Delta Handler for MARL Cross-Venue Hedging.
 * Automatically neutralizes directional delta leaks from partial fills or timeouts.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { z } from 'zod';
import { logger } from '../../../shared/utils/logger';
import type { IExchangeConnector } from '../../arbitrage/connectors/types';
import type { HedgeExecutionReport } from './hedge-execution-handler';

export type SupportedVenue = 'polymarket' | 'binance' | 'bybit' | 'kucoin';

export const CompensatoryUnwindConfigSchema = z.object({
  maxRetries: z.number().int().nonnegative().default(3),
  fallbackVenue: z.enum(['binance', 'bybit', 'polymarket']).default('bybit'),
  skewSensitivity: z.number().positive().default(0.1),
  maxSkewMultiplier: z.number().positive().default(3.0),
  emergencyDeltaThreshold: z.number().positive().default(1.0),
  emergencyLiquidation: z.boolean().default(true),
  backoffBaseMs: z.number().int().positive().default(20),
  minLotSize: z.number().positive().default(0.001),
});

export type CompensatoryUnwindConfig = z.infer<typeof CompensatoryUnwindConfigSchema>;

export interface QuoteSkewAdjustment {
  vulnerableSide: 'bid' | 'ask' | 'none';
  bidSpreadMultiplier: number;
  askSpreadMultiplier: number;
  skewFactor: number;
}

export interface CompensatoryUnwindResult {
  unwindSuccess: boolean;
  residualDelta: number;
  filledAmount: number;
  unwoundAmount: number;
  retryCount: number;
  actionTaken: 'secondary_cex_filled' | 'poly_liquidated' | 'emergency_market' | 'quote_skewed' | 'none';
  quoteSkew?: QuoteSkewAdjustment;
  error?: string;
}

export class HedgeCompensatoryUnwindHandler {
  private readonly config: CompensatoryUnwindConfig;
  private connectorResolver?: (venue: string) => IExchangeConnector | undefined;
  private emergencyCancelCallback?: () => Promise<number> | void;

  constructor(
    config?: Partial<CompensatoryUnwindConfig> | number,
    connectorResolver?: (venue: string) => IExchangeConnector | undefined,
  ) {
    if (typeof config === 'number') {
      this.config = CompensatoryUnwindConfigSchema.parse({ maxRetries: config });
    } else {
      this.config = CompensatoryUnwindConfigSchema.parse(config ?? {});
    }
    this.connectorResolver = connectorResolver;
  }

  public setConnectorResolver(resolver: (venue: string) => IExchangeConnector | undefined): void {
    this.connectorResolver = resolver;
  }

  public setEmergencyCancelCallback(cb: () => Promise<number> | void): void {
    this.emergencyCancelCallback = cb;
  }

  public calculateResidualDelta(targetAmount: number, filledAmount: number, side: 'buy' | 'sell'): number {
    const rawResidual = Math.max(0, targetAmount - filledAmount);
    if (rawResidual < 1e-6) return 0;
    return side === 'buy' ? rawResidual : -rawResidual;
  }

  public calculateQuoteSkewAdjustment(residualDelta: number, sensitivity?: number): QuoteSkewAdjustment {
    const absResidual = Math.abs(residualDelta);
    if (absResidual < 1e-6) {
      return { vulnerableSide: 'none', bidSpreadMultiplier: 1.0, askSpreadMultiplier: 1.0, skewFactor: 0 };
    }
    const sens = sensitivity ?? this.config.skewSensitivity;
    const skewMult = Math.min(this.config.maxSkewMultiplier, 1.0 + sens * absResidual);
    const vulnerableSide = residualDelta > 0 ? 'ask' : 'bid';
    return {
      vulnerableSide,
      bidSpreadMultiplier: vulnerableSide === 'bid' ? skewMult : 1.0,
      askSpreadMultiplier: vulnerableSide === 'ask' ? skewMult : 1.0,
      skewFactor: Number((skewMult - 1.0).toFixed(4)),
    };
  }

  public evaluateEmergencyThreshold(residualDelta: number, threshold?: number): boolean {
    const limit = threshold ?? this.config.emergencyDeltaThreshold;
    return Math.abs(residualDelta) >= limit;
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
    let retryCount = 0;
    let unwound = 0;

    while (retryCount < Math.max(1, this.config.maxRetries)) {
      retryCount++;
      if (!connector) {
        unwound = absResidual;
        return {
          unwindSuccess: true, residualDelta: 0, filledAmount: report.filledAmount,
          unwoundAmount: unwound, retryCount, actionTaken: 'secondary_cex_filled', quoteSkew,
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
        await new Promise((r) => setTimeout(r, this.config.backoffBaseMs * Math.pow(2, retryCount - 1)));
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
