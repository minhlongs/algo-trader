import { describe, it, expect } from 'vitest';
import { ResolutionOracleSentinel } from '../../../../src/desk/risk/resolution-oracle-sentinel';

describe('ResolutionOracleSentinel', () => {
  it('registers assertions and tracks valid trading status', () => {
    const sentinel = new ResolutionOracleSentinel();

    sentinel.registerAssertion({
      marketId: 'market-uma-1',
      oracleType: 'UMA_OPTIMISTIC',
      assertionId: '0xabc123',
      proposedOutcome: 'YES',
      challengeWindowSeconds: 3600,
    });

    expect(sentinel.isMarketTradingPermitted('market-uma-1')).toBe(true);
    expect(sentinel.getAssertion('market-uma-1')?.status).toBe('PROPOSED');
  });

  it('triggers emergency market freeze upon dispute registration', () => {
    const sentinel = new ResolutionOracleSentinel();

    sentinel.registerAssertion({
      marketId: 'market-disputed',
      oracleType: 'UMA_OPTIMISTIC',
      assertionId: '0xdef456',
      proposedOutcome: 'NO',
    });

    const alert = sentinel.registerDispute('market-disputed', 'Challenger posted dispute bond');
    expect(alert).not.toBeNull();
    expect(alert?.action).toBe('FREEZE');

    expect(sentinel.isMarketTradingPermitted('market-disputed')).toBe(false);
    expect(sentinel.getFrozenMarkets()).toContain('market-disputed');

    // Unfreezes after settlement
    sentinel.resolveSettlement('market-disputed');
    expect(sentinel.isMarketTradingPermitted('market-disputed')).toBe(true);
  });
});
