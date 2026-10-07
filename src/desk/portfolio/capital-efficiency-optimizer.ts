/**
 * Capital Efficiency Optimizer
 *
 * Evaluates capital allocation and margin utilization across multiple trading venues
 * to minimize cash drag and prevent margin shortfall rejections.
 *
 * @module desk/portfolio/capital-efficiency-optimizer
 */

import { EventEmitter } from 'events';
import type {
  VenueCollateralInfo,
  RebalanceRecommendation,
  CapitalEfficiencyReport,
} from './capital-efficiency-types';

export class CapitalEfficiencyOptimizer extends EventEmitter {
  private readonly minTransferThresholdUsd: number;

  constructor(minTransferThresholdUsd: number = 50) {
    super();
    this.minTransferThresholdUsd = minTransferThresholdUsd;
  }

  public optimizeAllocations(venues: readonly VenueCollateralInfo[]): CapitalEfficiencyReport {
    let totalPortfolioEquityUsd = 0;
    let totalIdleCapitalUsd = 0;
    let totalLockedMarginUsd = 0;

    for (const v of venues) {
      totalPortfolioEquityUsd += v.totalEquityUsd;
      totalIdleCapitalUsd += v.availableUsd;
      totalLockedMarginUsd += v.lockedMarginUsd;
    }

    const overallMarginUtilizationPct =
      totalPortfolioEquityUsd > 0 ? (totalLockedMarginUsd / totalPortfolioEquityUsd) * 100 : 0;

    const recommendations: RebalanceRecommendation[] = [];

    // Calculate surplus and deficit against target allocations
    const imbalances = venues.map((v) => {
      const targetEquityUsd = totalPortfolioEquityUsd * v.targetAllocationPct;
      const discrepancyUsd = v.totalEquityUsd - targetEquityUsd;
      return {
        venue: v.venue,
        available: v.availableUsd,
        discrepancy: discrepancyUsd, // > 0 is surplus, < 0 is deficit
      };
    });

    const surplusVenues = imbalances
      .filter((i) => i.discrepancy > this.minTransferThresholdUsd && i.available > 0)
      .sort((a, b) => b.discrepancy - a.discrepancy);

    const deficitVenues = imbalances
      .filter((i) => i.discrepancy < -this.minTransferThresholdUsd)
      .sort((a, b) => a.discrepancy - b.discrepancy);

    for (const def of deficitVenues) {
      let needed = Math.abs(def.discrepancy);
      for (const sur of surplusVenues) {
        if (needed <= 0 || sur.discrepancy <= 0) continue;
        const transferable = Math.min(needed, sur.discrepancy, sur.available);
        if (transferable >= this.minTransferThresholdUsd) {
          recommendations.push({
            fromVenue: sur.venue,
            toVenue: def.venue,
            transferAmountUsd: Math.round(transferable * 100) / 100,
            reason: `Rebalance capital to target allocation (target deficit: $${Math.round(needed)})`,
          });
          needed -= transferable;
          sur.discrepancy -= transferable;
          sur.available -= transferable;
        }
      }
    }

    const report: CapitalEfficiencyReport = {
      totalPortfolioEquityUsd: Math.round(totalPortfolioEquityUsd * 100) / 100,
      totalIdleCapitalUsd: Math.round(totalIdleCapitalUsd * 100) / 100,
      overallMarginUtilizationPct: Math.round(overallMarginUtilizationPct * 100) / 100,
      recommendations,
      timestamp: Date.now(),
    };

    if (recommendations.length > 0) {
      this.emit('rebalanceRequired', report);
    }

    return report;
  }
}
