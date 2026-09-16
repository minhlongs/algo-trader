/**
 * Marketplace Payout Scheduler Test Fixtures
 *
 * Types and test data factory helpers.
 */

export const mockPendingShare = {
  id: 'rev_001',
  strategyId: 'strat_001',
  tenantId: 'tenant_001',
  subscriptionId: 'sub_001',
  grossRevenueCents: 2999,
  platformShareCents: 600,
  creatorShareCents: 2399,
  status: 'pending',
};

export const mockPendingShareDetail = {
  id: 'rev_001',
  strategyId: 'strat_001',
  status: 'pending',
  creatorShareCents: 2399,
};

export const mockStrategy = {
  id: 'strat_001',
  payoutAddress: 'TXxxUSDTTRC20WalletAddress12345',
};
