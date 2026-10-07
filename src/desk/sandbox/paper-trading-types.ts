/**
 * Paper Trading & Fill Simulation Types
 *
 * Contracts for dry-run matching, fee deduction, and virtual portfolio accounting.
 *
 * @module desk/sandbox/paper-trading-types
 */

import type { BookLevel, OutcomeSide, OrderAction } from '../execution/pm-sor-types';

export interface PaperOrderRequest {
  readonly orderId: string;
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly action: OrderAction;
  readonly orderType: 'MARKET' | 'LIMIT';
  readonly limitPrice?: number;
  readonly quantity: number;
}

export interface PaperFillRecord {
  readonly orderId: string;
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly action: OrderAction;
  readonly filledQuantity: number;
  readonly averagePrice: number;
  readonly feeUsd: number;
  readonly totalCostUsd: number;
  readonly timestamp: number;
}

export interface VirtualPosition {
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly quantity: number;
  readonly costBasisUsd: number;
}

export interface PaperAccountSummary {
  readonly cashBalanceUsd: number;
  readonly positionsValueUsd: number;
  readonly totalEquityUsd: number;
  readonly totalFeesPaidUsd: number;
  readonly positionsCount: number;
}
