/**
 * Desk Strategy Seeder Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetStrategy = vi.fn();
const mockCreateStrategy = vi.fn();
const mockUpdateStatus = vi.fn();
const mockCreateListing = vi.fn();

vi.mock('../services/marketplace.service', () => ({
  marketplaceService: {
    getStrategy: (...args: unknown[]) => mockGetStrategy(...args),
    createStrategy: (...args: unknown[]) => mockCreateStrategy(...args),
    updateStrategyStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    createListing: (...args: unknown[]) => mockCreateListing(...args),
  },
}));

import { seedDeskStrategies } from '../services/desk-strategy-seeder';

describe('seedDeskStrategies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates all 9 desk strategies when none exist', async () => {
    mockGetStrategy.mockResolvedValue(null); // none exist
    mockCreateStrategy.mockResolvedValue({ id: 'test' });
    mockUpdateStatus.mockResolvedValue({ id: 'test' });
    mockCreateListing.mockResolvedValue({ id: 'listing-test' });

    const result = await seedDeskStrategies();

    expect(result.created).toBe(9);
    expect(result.skipped).toBe(0);
    expect(mockCreateStrategy).toHaveBeenCalledTimes(9);
    expect(mockUpdateStatus).toHaveBeenCalledTimes(9);
    expect(mockCreateListing).toHaveBeenCalledTimes(9);
  });

  it('verifies first strategy has correct fields', async () => {
    mockGetStrategy.mockResolvedValue(null);
    mockCreateStrategy.mockResolvedValue({ id: 'test' });
    mockUpdateStatus.mockResolvedValue({ id: 'test' });
    mockCreateListing.mockResolvedValue({ id: 'listing-test' });

    await seedDeskStrategies();

    const firstCall = mockCreateStrategy.mock.calls[0][0];
    expect(firstCall.id).toBe('cross-platform-arb');
    expect(firstCall.name).toBe('Cross-Platform Arbitrage');
    expect(firstCall.category).toBe('arbitrage');
    expect(firstCall.riskLevel).toBe(6);
    expect(firstCall.tenantId).toBe('system');
    expect(firstCall.creatorId).toBe('operator');

    // First listing call should be for cross-platform-arb, $149/mo
    const firstListing = mockCreateListing.mock.calls[0][0];
    expect(firstListing.strategyId).toBe('cross-platform-arb');
    expect(firstListing.priceUsdMonthly).toBe(14900);
    expect(firstListing.billingCycle).toBe('monthly');
    expect(firstListing.isActive).toBe(true);
  });

  it('skips existing strategies (idempotent)', async () => {
    mockGetStrategy.mockResolvedValue({ id: 'existing' }); // all exist
    mockCreateStrategy.mockResolvedValue({ id: 'test' });
    mockUpdateStatus.mockResolvedValue({ id: 'test' });
    mockCreateListing.mockResolvedValue({ id: 'listing-test' });

    const result = await seedDeskStrategies();

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(9);
    expect(mockCreateStrategy).not.toHaveBeenCalled();
  });

  it('mixes created and skipped when some exist', async () => {
    // First 2 exist, rest don't
    mockGetStrategy
      .mockResolvedValueOnce({ id: 'cross-platform-arb' })
      .mockResolvedValueOnce({ id: 'whale-copy-trader' })
      .mockResolvedValue(null);

    mockCreateStrategy.mockResolvedValue({ id: 'test' });
    mockUpdateStatus.mockResolvedValue({ id: 'test' });
    mockCreateListing.mockResolvedValue({ id: 'listing-test' });

    const result = await seedDeskStrategies();

    expect(result.created).toBe(7);
    expect(result.skipped).toBe(2);
    expect(mockCreateStrategy).toHaveBeenCalledTimes(7);
  });

  it('all strategies are approved (bypass vetting)', async () => {
    mockGetStrategy.mockResolvedValue(null);
    mockCreateStrategy.mockResolvedValue({ id: 'test' });
    mockUpdateStatus.mockResolvedValue({ id: 'test' });
    mockCreateListing.mockResolvedValue({ id: 'listing-test' });

    await seedDeskStrategies();

    for (const call of mockUpdateStatus.mock.calls) {
      expect(call[1]).toBe('approved');
    }
  });

  it('all strategies have supportedExchanges including polymarket', async () => {
    mockGetStrategy.mockResolvedValue(null);
    mockCreateStrategy.mockResolvedValue({ id: 'test' });
    mockUpdateStatus.mockResolvedValue({ id: 'test' });
    mockCreateListing.mockResolvedValue({ id: 'listing-test' });

    await seedDeskStrategies();

    for (const call of mockCreateStrategy.mock.calls) {
      expect(call[0].supportedExchanges).toContain('polymarket');
    }
  });

  it('pricing matches expected tiers', async () => {
    mockGetStrategy.mockResolvedValue(null);
    mockCreateStrategy.mockResolvedValue({ id: 'test' });
    mockUpdateStatus.mockResolvedValue({ id: 'test' });
    mockCreateListing.mockResolvedValue({ id: 'listing-test' });

    await seedDeskStrategies();

    const prices = mockCreateListing.mock.calls.map((c) => c[0].priceUsdMonthly);
    // cross-platform-arb: 14900, whale-copy-trader: 9900, delta-neutral-vol-arb: 12900,
    // resolution-frontrunner: 7900, listing-arbitrage-sniper: 7900, cycle-end-sniper: 8900,
    // delta-neutral-volatility-arbitrage: 12900, cross-event-drift-v2: 7900, resolution-frontrunner-v2: 7900
    expect(prices).toContain(14900);
    expect(prices).toContain(9900);
    expect(prices).toContain(12900);
    expect(prices).toContain(8900);
    expect(prices.filter((p: number) => p === 7900).length).toBe(4); // 4 strategies at $79
  });
});
