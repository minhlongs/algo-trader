/**
 * Resolution Oracle Sentinel
 *
 * Monitors oracle resolution proposals, detects disputes (e.g. UMA challenger windows),
 * and emits emergency trading halt / freeze signals to safeguard pending order flows.
 *
 * @module desk/risk/resolution-oracle-sentinel
 */

import { EventEmitter } from 'events';
import type {
  OracleAssertionRecord,
  OracleFreezeAlert,
  OracleDisputeStatus,
} from './resolution-oracle-types';

export class ResolutionOracleSentinel extends EventEmitter {
  private assertions = new Map<string, OracleAssertionRecord>();
  private frozenMarkets = new Set<string>();

  public registerAssertion(params: {
    marketId: string;
    oracleType: 'UMA_OPTIMISTIC' | 'CHAINLINK' | 'MANUAL';
    assertionId: string;
    proposedOutcome: string;
    challengeWindowSeconds?: number;
    now?: number;
  }): OracleAssertionRecord {
    const timestamp = params.now ?? Date.now();
    const challengeWindow = params.challengeWindowSeconds ?? 7200; // default 2h

    const record: OracleAssertionRecord = {
      marketId: params.marketId,
      oracleType: params.oracleType,
      assertionId: params.assertionId,
      proposedOutcome: params.proposedOutcome,
      assertionTimestamp: timestamp,
      challengeWindowSeconds: challengeWindow,
      isDisputed: false,
      status: 'PROPOSED',
    };

    this.assertions.set(params.marketId, record);
    return record;
  }

  public registerDispute(marketId: string, reason: string): OracleFreezeAlert | null {
    const existing = this.assertions.get(marketId);
    if (!existing) return null;

    const updated: OracleAssertionRecord = {
      ...existing,
      isDisputed: true,
      status: 'CHALLENGED',
    };
    this.assertions.set(marketId, updated);
    this.frozenMarkets.add(marketId);

    const alert: OracleFreezeAlert = {
      marketId,
      action: 'FREEZE',
      reason: `Oracle resolution disputed: ${reason}`,
      timestamp: Date.now(),
    };

    this.emit('marketFrozen', alert);
    return alert;
  }

  public resolveSettlement(marketId: string): void {
    const existing = this.assertions.get(marketId);
    if (existing) {
      this.assertions.set(marketId, {
        ...existing,
        isDisputed: false,
        status: 'SETTLED',
      });
    }
    this.frozenMarkets.delete(marketId);
    this.emit('marketUnfrozen', {
      marketId,
      action: 'UNFREEZE',
      reason: 'Oracle settlement finalized',
      timestamp: Date.now(),
    });
  }

  public isMarketTradingPermitted(marketId: string, now: number = Date.now()): boolean {
    if (this.frozenMarkets.has(marketId)) return false;

    const assertion = this.assertions.get(marketId);
    if (!assertion) return true;

    if (assertion.status === 'CHALLENGED' || assertion.isDisputed) return false;

    // In optimistic oracle proposal window, trading can be restricted or monitored
    const expiry = assertion.assertionTimestamp + assertion.challengeWindowSeconds * 1000;
    if (assertion.status === 'PROPOSED' && now < expiry) {
      // Market is under active challenge period
      return true;
    }

    return true;
  }

  public getAssertion(marketId: string): OracleAssertionRecord | undefined {
    return this.assertions.get(marketId);
  }

  public getFrozenMarkets(): readonly string[] {
    return Array.from(this.frozenMarkets);
  }
}
