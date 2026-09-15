/**
 * Shared fixtures for marketplace-subscription-routes tests.
 *
 * Exports:
 *  - fakeSub(overrides?): generates mock subscription entity
 */

export function fakeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_001',
    tenantId: 'tenant_001',
    listingId: 'listing_001',
    strategyId: 'strat_001',
    status: 'active',
    allocationPercent: 25,
    currentInvestmentUsd: 10000,
    totalPnlUsd: 500,
    subscriptionStartedAt: '2026-06-15T00:00:00.000Z',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}
