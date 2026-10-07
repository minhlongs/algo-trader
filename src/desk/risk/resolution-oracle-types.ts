/**
 * Resolution Oracle Sentinel Types
 *
 * Contracts for tracking oracle assertions, dispute windows,
 * and automated emergency freeze actions.
 *
 * @module desk/risk/resolution-oracle-types
 */

export type OracleDisputeStatus = 'CLEAR' | 'PROPOSED' | 'CHALLENGED' | 'SETTLED';

export interface OracleAssertionRecord {
  readonly marketId: string;
  readonly oracleType: 'UMA_OPTIMISTIC' | 'CHAINLINK' | 'MANUAL';
  readonly assertionId: string;
  readonly proposedOutcome: string;
  readonly assertionTimestamp: number;
  readonly challengeWindowSeconds: number;
  readonly isDisputed: boolean;
  readonly status: OracleDisputeStatus;
}

export interface OracleFreezeAlert {
  readonly marketId: string;
  readonly action: 'FREEZE' | 'UNFREEZE';
  readonly reason: string;
  readonly timestamp: number;
}
