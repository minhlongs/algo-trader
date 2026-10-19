/**
 * Delta-Neutral Coordinator Types, Config Schema, and Hysteresis Band Trigger
 */

import { z } from 'zod';
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
  venue: string;
  takerFeeBps: number;
  availableBalance: number;
  latencyMs: number;
  isHealthy: boolean;
}

export interface RebalanceEvaluation {
  triggerRebalance: boolean;
  targetHedgeAmount: number;
}

export interface RebalanceExecutionResult {
  triggered: boolean;
  targetHedgeAmount: number;
  selectedVenue?: string;
  report?: HedgeExecutionReport;
  finalState: CoordinatorState;
  error?: string;
}

export class ToleranceBandRebalanceTrigger {
  private inRebalanceState = false;

  constructor(
    public readonly deltaThreshold: number = 0.10,
    public readonly hysteresisRatio: number = 0.50,
  ) {}

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
