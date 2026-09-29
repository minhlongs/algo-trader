/**
 * Accounting Reconciler
 * Enforces Zero Accounting Drift Invariant: Equity = Cash_unallocated + sum(Capital_k + PnL_k)
 */

import { logger } from '../../shared/utils/logger';
import type { EngineId } from '../portfolio/types';
import type { ConsolidatedPortfolioSnapshot } from './telemetry-types';

export interface ZeroDriftResult {
  readonly isZeroDrift: boolean;
  readonly driftUsd: number;
  readonly expectedEquityUsd: number;
  readonly actualEquityUsd: number;
  readonly breakdown?: Record<string, number>;
}

export class AccountingReconciler {
  public static readonly DEFAULT_TOLERANCE_USD = 1e-4;

  /**
   * Static verification method directly compatible with portfolio test fixtures.
   */
  public static verifyZeroDrift(
    portfolioEquity: number,
    unallocatedCash: number,
    engineCapitals: Record<EngineId, number>,
    enginePnls: Record<EngineId, number>,
    tolerance = AccountingReconciler.DEFAULT_TOLERANCE_USD
  ): { isZeroDrift: boolean; driftUsd: number } {
    const totalEngineSum = Object.keys(engineCapitals).reduce((sum, key) => {
      const id = key as EngineId;
      return sum + (engineCapitals[id] ?? 0) + (enginePnls[id] ?? 0);
    }, 0);

    const calculatedTotal = unallocatedCash + totalEngineSum;
    const driftUsd = Math.abs(portfolioEquity - calculatedTotal);
    const isZeroDrift = driftUsd <= tolerance;

    if (!isZeroDrift) {
      logger.warn('Accounting drift detected in portfolio balance', {
        portfolioEquity,
        calculatedTotal,
        driftUsd,
        tolerance,
      });
    }

    return {
      isZeroDrift,
      driftUsd,
    };
  }

  /**
   * Reconciles a full ConsolidatedPortfolioSnapshot against individual engine feeds.
   */
  public reconcileSnapshot(
    snapshot: ConsolidatedPortfolioSnapshot,
    tolerance = AccountingReconciler.DEFAULT_TOLERANCE_USD
  ): ZeroDriftResult {
    const engineSum = Object.values(snapshot.engineSnapshots).reduce(
      (acc, s) => acc + s.allocatedCapitalUsd + s.mtmPnlUsd,
      0
    );
    const expectedEquityUsd = snapshot.unallocatedCashUsd + engineSum;
    const driftUsd = Math.abs(snapshot.totalEquityUsd - expectedEquityUsd);
    const isZeroDrift = driftUsd <= tolerance;

    if (!isZeroDrift) {
      logger.warn('Consolidated portfolio snapshot failed zero accounting drift invariant', {
        totalEquityUsd: snapshot.totalEquityUsd,
        expectedEquityUsd,
        driftUsd,
        tolerance,
        timestamp: snapshot.timestamp,
      });
    }

    const breakdown: Record<string, number> = {
      unallocatedCash: snapshot.unallocatedCashUsd,
      totalAllocatedCapital: snapshot.allocatedCapitalUsd,
      totalMtmPnl: snapshot.totalMtmPnlUsd,
    };
    for (const [id, s] of Object.entries(snapshot.engineSnapshots)) {
      breakdown[`engine_${id}`] = s.allocatedCapitalUsd + s.mtmPnlUsd;
    }

    return {
      isZeroDrift,
      driftUsd,
      expectedEquityUsd,
      actualEquityUsd: snapshot.totalEquityUsd,
      breakdown,
    };
  }
}
