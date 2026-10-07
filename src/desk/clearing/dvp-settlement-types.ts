/**
 * Atomic Delivery-versus-Payment (DvP) Settlement Types
 * Contracts for conditional token and stablecoin cross-venue atomic swaps.
 *
 * @module desk/clearing/dvp-settlement-types
 */

export type DvPPhase =
  | 'UNINITIALIZED'
  | 'ESCROW_LOCKED'
  | 'EXECUTING'
  | 'SETTLED'
  | 'ROLLING_BACK'
  | 'REFUNDED'
  | 'FAILED';

export interface DvPLeg {
  readonly party: 'MAKER' | 'TAKER';
  readonly assetAddress: string;
  readonly tokenId?: string;
  readonly amountUnits: number;
}

export interface DvPSwapIntent {
  readonly tradeId: string;
  readonly makerLeg: DvPLeg;
  readonly takerLeg: DvPLeg;
  readonly expiryTimestampMs: number;
  readonly nonce: number;
  readonly hashLock?: string;
}

export interface SettlementReceipt {
  readonly txHash: string;
  readonly confirmations: number;
  readonly status: 'SUCCESS' | 'REVERTED' | 'PENDING';
  readonly blockNumber: number;
  readonly timestampMs: number;
}

export interface DvPExecutionOutcome {
  readonly tradeId: string;
  readonly phase: DvPPhase;
  readonly isCompleted: boolean;
  readonly isRollbackApplied: boolean;
  readonly failureReason?: string;
  readonly settledAtTimestampMs?: number;
}
