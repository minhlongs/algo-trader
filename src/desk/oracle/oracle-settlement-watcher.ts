/**
 * Oracle Settlement & Dispute Watcher
 *
 * Tracks incoming decentralized oracle resolution proposals, monitors
 * challenge liveness windows, detects disputes, and generates settlement claims.
 *
 * @module desk/oracle/oracle-settlement-watcher
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'crypto';
import type {
  OracleResolutionEvent,
  SettlementClaimAction,
} from './oracle-settlement-types';

export class OracleSettlementWatcher extends EventEmitter {
  private readonly events = new Map<string, OracleResolutionEvent>();

  public ingestEvent(event: OracleResolutionEvent): void {
    const existing = this.events.get(event.marketId);
    this.events.set(event.marketId, event);

    if (event.status === 'DISPUTED') {
      this.emit('disputeDetected', {
        marketId: event.marketId,
        oracle: event.oracle,
        disputerAddress: event.disputerAddress,
        timestamp: event.timestamp,
      });
    } else if (event.status === 'RESOLVED') {
      this.emit('resolutionFinalized', {
        marketId: event.marketId,
        winningOutcome: event.proposedOutcome,
        timestamp: event.timestamp,
      });
    } else if (!existing && event.status === 'PROPOSED') {
      this.emit('proposalRegistered', {
        marketId: event.marketId,
        proposedOutcome: event.proposedOutcome,
        livenessDeadline: event.livenessDeadline,
      });
    }
  }

  public checkPendingDisputes(): OracleResolutionEvent[] {
    return Array.from(this.events.values()).filter((e) => e.status === 'DISPUTED');
  }

  public generateSettlementClaim(
    marketId: string,
    holdings: { outcome: 'YES' | 'NO' | 'TIE' | 'INVALID'; shares: number },
    currentTime: number = Date.now()
  ): SettlementClaimAction | null {
    const event = this.events.get(marketId);
    if (!event) return null;

    // Ready if explicitly RESOLVED or PROPOSED with expired liveness deadline
    const isMatured =
      event.status === 'RESOLVED' ||
      (event.status === 'PROPOSED' && currentTime >= event.livenessDeadline);

    if (!isMatured || event.status === 'DISPUTED') {
      return null;
    }

    const won = holdings.outcome === event.proposedOutcome;
    if (!won || holdings.shares <= 0) {
      return null;
    }

    return {
      claimId: `claim-${randomUUID()}`,
      marketId,
      winningOutcome: event.proposedOutcome,
      redeemableShares: holdings.shares,
      expectedPayoutUsd: holdings.shares * 1.0, // binary pays $1.00 per winning share
      readyForExecution: true,
    };
  }
}
