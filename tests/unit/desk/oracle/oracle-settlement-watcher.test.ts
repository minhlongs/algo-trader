import { describe, it, expect, vi } from 'vitest';
import { OracleSettlementWatcher } from '../../../../src/desk/oracle/oracle-settlement-watcher';
import type { OracleResolutionEvent } from '../../../../src/desk/oracle/oracle-settlement-types';

describe('OracleSettlementWatcher', () => {
  it('emits disputeDetected event when an oracle proposal is contested', () => {
    const watcher = new OracleSettlementWatcher();
    const disputeSpy = vi.fn();
    watcher.on('disputeDetected', disputeSpy);

    const disputeEvent: OracleResolutionEvent = {
      eventId: 'evt-uma-1',
      marketId: 'market-disputed',
      oracle: 'UMA_OPTIMISTIC',
      proposedOutcome: 'YES',
      disputerAddress: '0x1234567890abcdef',
      status: 'DISPUTED',
      livenessDeadline: Date.now() + 7200000,
      timestamp: Date.now(),
    };

    watcher.ingestEvent(disputeEvent);
    expect(disputeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: 'market-disputed',
        oracle: 'UMA_OPTIMISTIC',
      })
    );
    expect(watcher.checkPendingDisputes().length).toBe(1);
  });

  it('generates settlement claim for winning shares when proposal reaches finality', () => {
    const watcher = new OracleSettlementWatcher();
    const now = 1700000000000;

    const resolvedEvent: OracleResolutionEvent = {
      eventId: 'evt-chainlink-2',
      marketId: 'market-won',
      oracle: 'CHAINLINK',
      proposedOutcome: 'YES',
      status: 'RESOLVED',
      livenessDeadline: now - 1000,
      timestamp: now - 500,
    };

    watcher.ingestEvent(resolvedEvent);

    const claim = watcher.generateSettlementClaim(
      'market-won',
      { outcome: 'YES', shares: 5000 },
      now
    );

    expect(claim).not.toBeNull();
    expect(claim?.winningOutcome).toBe('YES');
    expect(claim?.redeemableShares).toBe(5000);
    expect(claim?.expectedPayoutUsd).toBe(5000);
    expect(claim?.readyForExecution).toBe(true);
  });

  it('rejects settlement claim when proposal is disputed or shares belong to losing outcome', () => {
    const watcher = new OracleSettlementWatcher();
    const now = 1700000000000;

    watcher.ingestEvent({
      eventId: 'evt-uma-3',
      marketId: 'market-contested',
      oracle: 'UMA_OPTIMISTIC',
      proposedOutcome: 'YES',
      status: 'DISPUTED',
      livenessDeadline: now - 1000,
      timestamp: now,
    });

    // Claim on disputed market -> null
    const claimDisputed = watcher.generateSettlementClaim(
      'market-contested',
      { outcome: 'YES', shares: 1000 },
      now
    );
    expect(claimDisputed).toBeNull();

    // Claim with losing outcome -> null
    watcher.ingestEvent({
      eventId: 'evt-uma-4',
      marketId: 'market-resolved-no',
      oracle: 'UMA_OPTIMISTIC',
      proposedOutcome: 'NO',
      status: 'RESOLVED',
      livenessDeadline: now - 1000,
      timestamp: now,
    });

    const claimLosing = watcher.generateSettlementClaim(
      'market-resolved-no',
      { outcome: 'YES', shares: 1000 }, // Held YES, but NO won
      now
    );
    expect(claimLosing).toBeNull();
  });

  it('covers proposal registration, matured proposals, and missing events', () => {
    const watcher = new OracleSettlementWatcher();
    const propSpy = vi.fn();
    watcher.on('proposalRegistered', propSpy);
    const now = 1700000000000;

    // Proposal registered
    watcher.ingestEvent({
      eventId: 'evt-1',
      marketId: 'm-prop',
      oracle: 'UMA_OPTIMISTIC',
      proposedOutcome: 'YES',
      status: 'PROPOSED',
      livenessDeadline: now - 100, // expired deadline
      timestamp: now - 500,
    });
    expect(propSpy).toHaveBeenCalled();

    // Matured proposal claim
    const claim = watcher.generateSettlementClaim(
      'm-prop',
      { outcome: 'YES', shares: 100 },
      now
    );
    expect(claim).not.toBeNull();
    expect(claim?.expectedPayoutUsd).toBe(100);

    // Missing event
    expect(watcher.generateSettlementClaim('non-existent', { outcome: 'YES', shares: 100 })).toBeNull();

    // Zero shares
    expect(watcher.generateSettlementClaim('m-prop', { outcome: 'YES', shares: 0 }, now)).toBeNull();

    // Existing proposal event re-ingestion does not re-emit proposalRegistered
    const secondPropSpy = vi.fn();
    watcher.on('proposalRegistered', secondPropSpy);
    watcher.ingestEvent({
      eventId: 'evt-dup',
      marketId: 'm-prop',
      oracle: 'UMA_OPTIMISTIC',
      proposedOutcome: 'YES',
      status: 'PROPOSED',
      livenessDeadline: now,
      timestamp: now,
    });
    expect(secondPropSpy).not.toHaveBeenCalled();
  });
});
