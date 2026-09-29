/**
 * Delta-Neutral Coordinator for MARL Cross-Venue Hedging.
 * Evaluates net delta against tolerance & hysteresis bands, sizes hedge orders,
 * selects optimal CEX venues, and executes the rebalance state machine.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { z } from 'zod';
import { logger } from '../../../shared/utils/logger';
import type { IExchangeConnector } from '../../arbitrage/connectors/types';
import type { PortfolioDeltaSnapshot } from './inventory-delta-tracker';
import type { HedgeExecutionReport } from './hedge-execution-handler';

export type CoordinatorState = 'IDLE' | 'EVALUATING' | 'HEDGING' | 'UNWINDING' | 'REBALANCED' | 'ERROR';
export type HedgeSizingMode = 'full' | 'inner_band';

export const DeltaNeutralCoordinatorConfigSchema = z.object({
  deltaThreshold: z.number().positive().default(0.10),
  hysteresisRatio: z.number().min(0.01).max(0.99).default(0.50),
  innerThreshold: z.number().positive().optional(),
  sizingMode: z.enum(['full', 'inner_band']).default('full'),
  primaryVenue: z.enum(['binance', 'bybit']).default('binance'),
  fallbackVenue: z.enum(['binance', 'bybit']).default('bybit'),
  maxLatencyMs: z.number().int().positive().default(200),
  minLotSize: z.number().positive().default(0.001),
});

export type DeltaNeutralCoordinatorConfig = z.infer<typeof DeltaNeutralCoordinatorConfigSchema>;

export interface VenueCandidate {
  venue: string; takerFeeBps: number; availableBalance: number; latencyMs: number; isHealthy: boolean;
}

export interface RebalanceEvaluation {
  triggerRebalance: boolean; targetHedgeAmount: number;
}

export interface RebalanceExecutionResult {
  triggered: boolean; targetHedgeAmount: number; selectedVenue?: string;
  report?: HedgeExecutionReport; finalState: CoordinatorState; error?: string;
}

export class ToleranceBandRebalanceTrigger {
  private inRebalanceState = false;

  constructor(public readonly deltaThreshold: number = 0.10, public readonly hysteresisRatio: number = 0.50) {}

  public evaluate(netDelta: number): RebalanceEvaluation {
    const absDelta = Math.abs(netDelta);
    const innerBand = this.deltaThreshold * this.hysteresisRatio;
    if (!this.inRebalanceState) {
      if (absDelta > this.deltaThreshold) {
        this.inRebalanceState = true;
        return { triggerRebalance: true, targetHedgeAmount: -netDelta };
      }
      return { triggerRebalance: false, targetHedgeAmount: 0 };
    }
    if (absDelta <= innerBand) {
      this.inRebalanceState = false;
      return { triggerRebalance: false, targetHedgeAmount: 0 };
    }
    return { triggerRebalance: true, targetHedgeAmount: -netDelta };
  }

  public reset(): void {
    this.inRebalanceState = false;
  }
}

export class DeltaNeutralCoordinator {
  private state: CoordinatorState = 'IDLE';
  private readonly config: DeltaNeutralCoordinatorConfig;
  private readonly trigger: ToleranceBandRebalanceTrigger;
  private readonly connectors = new Map<string, IExchangeConnector>();
  private readonly takerFees = new Map<string, number>([['binance', 4.0], ['bybit', 6.0]]);

  constructor(config?: Partial<DeltaNeutralCoordinatorConfig>, connectors?: Map<string, IExchangeConnector>) {
    this.config = DeltaNeutralCoordinatorConfigSchema.parse(config ?? {});
    this.trigger = new ToleranceBandRebalanceTrigger(this.config.deltaThreshold, this.config.hysteresisRatio);
    if (connectors) {
      for (const [v, conn] of connectors.entries()) this.connectors.set(v.toLowerCase(), conn);
    }
  }

  public getState(): CoordinatorState {
    return this.state;
  }

  public registerConnector(venue: string, connector: IExchangeConnector): void {
    this.connectors.set(venue.toLowerCase(), connector);
  }

  public setTakerFee(venue: string, feeBps: number): void {
    this.takerFees.set(venue.toLowerCase(), feeBps);
  }

  public evaluateTolerance(netDelta: number): RebalanceEvaluation {
    const rawEval = this.trigger.evaluate(netDelta);
    if (!rawEval.triggerRebalance) return rawEval;

    const innerBand = this.config.innerThreshold ?? (this.config.deltaThreshold * this.config.hysteresisRatio);
    const absDelta = Math.abs(netDelta);
    let targetAmount = -netDelta;

    if (this.config.sizingMode === 'inner_band' && absDelta > innerBand) {
      const reduction = absDelta - innerBand;
      targetAmount = -Math.sign(netDelta) * reduction;
    }

    if (Math.abs(targetAmount) < this.config.minLotSize) {
      return { triggerRebalance: false, targetHedgeAmount: 0 };
    }
    return { triggerRebalance: true, targetHedgeAmount: Number(targetAmount.toFixed(4)) };
  }

  public async selectOptimalVenue(targetHedgeAmount: number, symbol: string, estimatedPrice: number): Promise<string> {
    const isBuy = targetHedgeAmount > 0;
    const requiredBase = Math.abs(targetHedgeAmount);
    const requiredQuote = requiredBase * estimatedPrice * 1.002;
    const candidates: VenueCandidate[] = [];

    for (const [venue, connector] of this.connectors.entries()) {
      try {
        const latency = await connector.getLatencyMs();
        if (latency > this.config.maxLatencyMs) continue;

        const balance = await connector.fetchBalance();
        const baseAsset = symbol.split('/')[0] ?? 'BTC';
        const quoteAsset = symbol.split('/')[1] ?? 'USDT';
        const available = isBuy ? (balance[quoteAsset]?.free ?? 0) : (balance[baseAsset]?.free ?? 0);
        const needed = isBuy ? requiredQuote : requiredBase;
        if (available < needed) continue;

        candidates.push({
          venue, takerFeeBps: this.takerFees.get(venue) ?? 10.0, availableBalance: available,
          latencyMs: latency, isHealthy: true,
        });
      } catch (err) {
        logger.warn(`[DeltaNeutralCoordinator] Venue health check failed for ${venue}`, { err });
      }
    }

    if (candidates.length === 0) {
      return this.connectors.has(this.config.primaryVenue) ? this.config.primaryVenue : this.config.fallbackVenue;
    }
    candidates.sort((a, b) => a.takerFeeBps - b.takerFeeBps || a.latencyMs - b.latencyMs);
    return candidates[0]!.venue;
  }

  public async coordinate(
    snapshot: PortfolioDeltaSnapshot,
    symbol: string = 'BTC/USDT',
    estimatedPrice: number = 50_000,
    dispatcher?: (targetDelta: number, venue: string) => Promise<HedgeExecutionReport>,
  ): Promise<RebalanceExecutionResult> {
    this.state = 'EVALUATING';
    const evalResult = this.evaluateTolerance(snapshot.netDelta);

    if (!evalResult.triggerRebalance || evalResult.targetHedgeAmount === 0) {
      this.state = 'IDLE';
      return { triggered: false, targetHedgeAmount: 0, finalState: 'IDLE' };
    }

    this.state = 'HEDGING';
    const selectedVenue = await this.selectOptimalVenue(evalResult.targetHedgeAmount, symbol, estimatedPrice);

    if (!dispatcher) {
      this.state = 'REBALANCED';
      return { triggered: true, targetHedgeAmount: evalResult.targetHedgeAmount, selectedVenue, finalState: 'REBALANCED' };
    }

    try {
      const report = await dispatcher(evalResult.targetHedgeAmount, selectedVenue);
      this.state = report.status === 'FILLED' ? 'REBALANCED' : report.status === 'PARTIAL' ? 'UNWINDING' : 'ERROR';
      return { triggered: true, targetHedgeAmount: evalResult.targetHedgeAmount, selectedVenue, report, finalState: this.state };
    } catch (err) {
      this.state = 'ERROR';
      return {
        triggered: true, targetHedgeAmount: evalResult.targetHedgeAmount,
        selectedVenue, finalState: 'ERROR', error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public reset(): void {
    this.state = 'IDLE';
    this.trigger.reset();
  }
}
