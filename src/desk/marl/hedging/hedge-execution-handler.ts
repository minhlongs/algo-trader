/**
 * Atomic Taker Order Execution Handler for MARL Delta Hedging.
 * Dispatches IOC/Market hedge orders via IExchangeConnector,
 * enforces venue latency tripwires, monitors timeouts, and tracks residual delta.
 */
import { logger } from '../../../shared/utils/logger';
import type { IExchangeConnector, ExchangeOrderParams } from '../../arbitrage/connectors/types';
import {
  type VenueId,
  HedgeExecutionConfigSchema,
  type HedgeExecutionConfig,
  type HedgeExecutionReport,
  buildHedgeReport,
  computeSimulatedHedgeReport,
  computeLiveFillReport,
  raceWithOrderTimeout,
} from './hedge-execution-helpers';

export {
  type VenueId,
  HedgeExecutionConfigSchema,
  type HedgeExecutionConfig,
  type HedgeExecutionReport,
  buildHedgeReport,
  computeSimulatedHedgeReport,
  computeLiveFillReport,
  raceWithOrderTimeout,
};

export class HedgeExecutionHandler {
  private readonly config: HedgeExecutionConfig;
  private readonly connectors = new Map<string, IExchangeConnector>();
  private readonly circuitBreakers = new Map<string, number>();

  constructor(config?: Partial<HedgeExecutionConfig>, connectors?: Map<string, IExchangeConnector>) {
    this.config = HedgeExecutionConfigSchema.parse(config ?? {});
    if (connectors) {
      for (const [k, v] of connectors.entries()) this.connectors.set(k.toLowerCase(), v);
    }
  }

  public registerConnector(venue: string, connector: IExchangeConnector): void {
    this.connectors.set(venue.toLowerCase(), connector);
  }

  public isCircuitBroken(venue: string): boolean {
    const trippedUntil = this.circuitBreakers.get(venue.toLowerCase());
    return trippedUntil !== undefined && Date.now() < trippedUntil;
  }

  public tripCircuit(venue: string, cooldownMs?: number): void {
    const duration = cooldownMs ?? this.config.circuitCooldownMs;
    this.circuitBreakers.set(venue.toLowerCase(), Date.now() + duration);
    logger.warn(`[HedgeExecutionHandler] Circuit tripped for venue ${venue} for ${duration}ms`);
  }

  public async dispatchHedge(
    targetDelta: number,
    venue: VenueId | string = this.config.primaryHedgeVenue,
    symbol: string = 'BTC/USDT',
    simulatedFillFraction: number = 1.0,
  ): Promise<HedgeExecutionReport> {
    const absAmount = Math.abs(targetDelta);
    const side: 'buy' | 'sell' = targetDelta < 0 ? 'sell' : 'buy';
    const venueKey = venue.toLowerCase();
    const hedgeId = `hdg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (absAmount === 0) {
      return buildHedgeReport(hedgeId, venue, symbol, side, 0, 0, 0, 0, 'FAILED', 0, 'ZERO_AMOUNT');
    }
    if (absAmount < this.config.minLotSize) {
      return buildHedgeReport(hedgeId, venue, symbol, side, absAmount, 0, 0, 1, 'FAILED', targetDelta, 'BELOW_MIN_LOT');
    }
    if (this.isCircuitBroken(venueKey)) {
      return buildHedgeReport(hedgeId, venue, symbol, side, absAmount, 0, 0, 1, 'FAILED', targetDelta, 'CIRCUIT_BROKEN');
    }

    const connector = this.connectors.get(venueKey);
    if (connector) {
      return this.executeLiveOrder(connector, hedgeId, venue, symbol, side, absAmount, targetDelta);
    }

    return computeSimulatedHedgeReport(hedgeId, venue, symbol, side, absAmount, simulatedFillFraction);
  }

  private async executeLiveOrder(
    connector: IExchangeConnector,
    hedgeId: string,
    venue: VenueId | string,
    symbol: string,
    side: 'buy' | 'sell',
    absAmount: number,
    targetDelta: number,
  ): Promise<HedgeExecutionReport> {
    const startTime = Date.now();
    try {
      const pingMs = await connector.getLatencyMs();
      if (pingMs > this.config.maxLatencyMs) {
        this.tripCircuit(String(venue));
        return buildHedgeReport(hedgeId, venue, symbol, side, absAmount, 0, 0, pingMs, 'FAILED', targetDelta, 'LATENCY_EXCEEDED');
      }

      const params: ExchangeOrderParams = {
        symbol,
        side,
        type: 'market',
        amount: absAmount,
        clientOrderId: `marl-${hedgeId}`,
      };
      const orderResult = await raceWithOrderTimeout(connector.placeOrder(params), this.config.orderTimeoutMs);
      const latencyMs = Math.max(1, Date.now() - startTime);
      return computeLiveFillReport(
        hedgeId, venue, symbol, side, absAmount, orderResult.filled ?? 0, orderResult.price ?? 0, latencyMs,
      );
    } catch (err) {
      const latencyMs = Math.max(1, Date.now() - startTime);
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[HedgeExecutionHandler] Order execution failed for ${venue}:${symbol}`, { err });
      return buildHedgeReport(hedgeId, venue, symbol, side, absAmount, 0, 0, latencyMs, 'FAILED', targetDelta, errMsg);
    }
  }
}

export { HedgeExecutionHandler as AtomicCrossVenueHedgeDispatcher };
