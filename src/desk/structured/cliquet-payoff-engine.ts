/**
 * Cliquet / Ratchet Structured Product Payoff Engine
 * Accumulates periodic returns with local caps, local floors, and global floors.
 *
 * @module desk/structured/cliquet-payoff-engine
 */

import {
  CliquetParameters,
  CliquetPayoffResult,
} from './structured-types';

export class CliquetPayoffEngine {
  /**
   * Computes cliquet payoff across periodic underlying asset return series.
   */
  public calculatePayoff(params: CliquetParameters): CliquetPayoffResult {
    const {
      notionalUsd,
      localCapPct,
      localFloorPct,
      globalFloorPct,
      periodReturnsPct,
    } = params;

    if (notionalUsd <= 0) {
      throw new Error('notionalUsd must be strictly positive');
    }
    if (localFloorPct > localCapPct) {
      throw new Error('localFloorPct cannot exceed localCapPct');
    }
    if (periodReturnsPct.length === 0) {
      throw new Error('periodReturnsPct must have at least one return');
    }

    const cappedFlooredPeriodReturns: number[] = [];
    let sumCappedReturnsPct = 0;

    for (const rawRet of periodReturnsPct) {
      // Apply local floor and local cap
      const constrainedRet = Math.min(localCapPct, Math.max(localFloorPct, rawRet));
      cappedFlooredPeriodReturns.push(Number(constrainedRet.toFixed(6)));
      sumCappedReturnsPct += constrainedRet;
    }

    // Apply global floor
    const effectivePayoffPct = Math.max(globalFloorPct, sumCappedReturnsPct);
    const totalPayoutUsd = notionalUsd * (1 + effectivePayoffPct);

    return {
      cappedFlooredPeriodReturns,
      sumCappedReturnsPct: Number(sumCappedReturnsPct.toFixed(6)),
      effectivePayoffPct: Number(effectivePayoffPct.toFixed(6)),
      totalPayoutUsd: Number(totalPayoutUsd.toFixed(2)),
    };
  }
}
