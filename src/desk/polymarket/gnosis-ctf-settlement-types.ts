/**
 * Gnosis CTF Settlement Relayer Types
 *
 * Types for conditional token payout calculation, resolution handling, and redemption.
 *
 * @module desk/polymarket/gnosis-ctf-settlement-types
 */

export interface ConditionPayoutReport {
  readonly conditionId: string;
  readonly questionId: string;
  readonly outcomeSlotCount: number;
  readonly payoutNumerators: readonly number[];
  readonly payoutDenominator: number;
  readonly isResolved: boolean;
  readonly resolvedAt?: number;
}

export interface PositionHolding {
  readonly conditionId: string;
  readonly indexSet: number; // e.g. 1 for YES (slot 0), 2 for NO (slot 1)
  readonly shares: number;
}

export interface RedemptionResult {
  readonly redemptionId: string;
  readonly conditionId: string;
  readonly collateralAmountReceivedUsd: number;
  readonly nonceUsed: number;
  readonly txHash: string;
  readonly timestamp: number;
}
