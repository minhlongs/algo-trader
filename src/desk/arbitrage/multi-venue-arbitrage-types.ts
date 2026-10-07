/**
 * Multi-Venue Arbitrage Router Types
 *
 * Contracts for evaluating cross-venue spreads, generating synchronized leg orders,
 * and handling execution routing.
 *
 * @module desk/arbitrage/multi-venue-arbitrage-types
 */

import type { OutcomeSide, OrderAction } from '../execution/pm-sor-types';

export interface ArbitrageVenueLeg {
  readonly venue: string;
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly action: OrderAction;
  readonly price: number;
  readonly availableQuantity: number;
  readonly feeRate: number;
}

export interface ArbitrageOpportunity {
  readonly opportunityId: string;
  readonly legA: ArbitrageVenueLeg;
  readonly legB: ArbitrageVenueLeg;
  readonly netSpreadPct: number;
  readonly maxExecutableQuantity: number;
  readonly expectedProfitUsd: number;
}

export interface ExecutedArbitrageRoute {
  readonly opportunityId: string;
  readonly executedQuantity: number;
  readonly totalCostUsd: number;
  readonly totalReturnUsd: number;
  readonly netProfitUsd: number;
  readonly timestamp: number;
}
