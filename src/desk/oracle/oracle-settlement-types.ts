/**
 * Oracle Settlement & Dispute Watcher Type Definitions
 *
 * @module desk/oracle/oracle-settlement-types
 */

export type OracleSource = 'UMA_OPTIMISTIC' | 'CHAINLINK' | 'POLYMARKET_INTERNAL';

export type ResolutionStatus =
  | 'PENDING_PROPOSAL'
  | 'PROPOSED'
  | 'DISPUTED'
  | 'RESOLVED'
  | 'SETTLED';

export interface OracleResolutionEvent {
  eventId: string;
  marketId: string;
  oracle: OracleSource;
  proposedOutcome: 'YES' | 'NO' | 'TIE' | 'INVALID';
  proposerAddress?: string;
  disputerAddress?: string;
  status: ResolutionStatus;
  livenessDeadline: number; // Unix timestamp ms
  timestamp: number;
}

export interface SettlementClaimAction {
  claimId: string;
  marketId: string;
  winningOutcome: 'YES' | 'NO' | 'TIE' | 'INVALID';
  redeemableShares: number;
  expectedPayoutUsd: number;
  readyForExecution: boolean;
}
