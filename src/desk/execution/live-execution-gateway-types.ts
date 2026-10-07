/**
 * Live Execution Gateway Types
 *
 * Contracts for bridging pre-trade risk safeguards, smart order routing,
 * and automated liquidity quotation.
 *
 * @module desk/execution/live-execution-gateway-types
 */

import type { SafeguardStatus } from '../risk/circuit-breaker-safeguard-types';
import type { SmartRoutePlan, VenueBookSnapshot, OutcomeSide, OrderAction } from './pm-sor-types';
import type { TwoSidedQuote } from '../mm/dynamic-lp-types';

export interface OrderIntent {
  readonly intentId: string;
  readonly marketId: string;
  readonly outcome: OutcomeSide;
  readonly action: OrderAction;
  readonly targetQuantity: number;
  readonly maxSlippagePct?: number;
  readonly clientTimestamp: number;
}

export interface ExecutionResult {
  readonly intentId: string;
  readonly status: 'FILLED' | 'REJECTED' | 'HALTED';
  readonly routePlan?: SmartRoutePlan;
  readonly rejectionReason?: string;
  readonly executedAt: number;
}

export interface GatewayStatus {
  readonly isOperational: boolean;
  readonly safeguard: SafeguardStatus;
  readonly activeQuotesCount: number;
  readonly totalOrdersProcessed: number;
  readonly totalVolumeProcessed: number;
}
