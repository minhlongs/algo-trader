/**
 * Closed-Loop Zero-Drift Reconciler (Milestone 4 - R4)
 * Real-time fill ingestion asserting the Zero Accounting Drift invariant (|delta| < 1e-4 USD).
 */

import type { EngineId } from '../orchestrator/orchestrator-types';
import { logger } from '../../shared/utils/logger';

export interface ReconcilerStatus {
  readonly isZeroDrift: boolean;
  readonly driftUsd: number;
  readonly toleranceUsd: number;
  readonly calculatedTotalUsd: number;
  readonly actualEquityUsd: number;
}

export class ClosedLoopReconciler {
  private unallocatedCashUsd: number;
  private engineBudgets: Record<EngineId, number>;
  private enginePnlUsd: Record<EngineId, number>;
  private readonly toleranceUsd: number;

  constructor(
    initialCash = 20000,
    initialBudgets?: Partial<Record<EngineId, number>>,
    toleranceUsd = 1e-4
  ) {
    this.unallocatedCashUsd = initialCash;
    this.toleranceUsd = toleranceUsd;
    this.engineBudgets = {
      arbitrage: 20000,
      marl: 20000,
      amm: 20000,
      'alpha-lab': 20000,
      ...initialBudgets,
    };
    this.enginePnlUsd = {
      arbitrage: 0,
      marl: 0,
      amm: 0,
      'alpha-lab': 0,
    };
  }

  public setUnallocatedCash(cash: number): void {
    this.unallocatedCashUsd = cash;
  }

  public setEngineBudgets(budgets: Record<EngineId, number>): void {
    this.engineBudgets = { ...budgets };
  }

  public ingestFill(engineId: EngineId, pnlDeltaUsd: number, feeUsd: number): void {
    this.enginePnlUsd[engineId] = (this.enginePnlUsd[engineId] ?? 0) + pnlDeltaUsd - feeUsd;
  }

  public reconcile(actualEquityUsd: number): ReconcilerStatus {
    const allocatedSum = Object.values(this.engineBudgets).reduce((a, b) => a + b, 0);
    const pnlSum = Object.values(this.enginePnlUsd).reduce((a, b) => a + b, 0);
    const calculatedTotal = this.unallocatedCashUsd + allocatedSum + pnlSum;
    const driftUsd = Math.abs(actualEquityUsd - calculatedTotal);
    const isZeroDrift = driftUsd < this.toleranceUsd;

    if (!isZeroDrift) {
      logger.warn(
        `[ClosedLoopReconciler] Accounting drift detected: actual=$${actualEquityUsd.toFixed(4)}, expected=$${calculatedTotal.toFixed(4)}, drift=$${driftUsd.toFixed(6)}`
      );
    }

    return {
      isZeroDrift,
      driftUsd,
      toleranceUsd: this.toleranceUsd,
      calculatedTotalUsd: calculatedTotal,
      actualEquityUsd,
    };
  }

  public getEnginePnl(): Readonly<Record<EngineId, number>> {
    return this.enginePnlUsd;
  }
}
