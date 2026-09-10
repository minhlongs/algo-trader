/**
 * Tests for trading-handlers — /campaign detail and list paths.
 *
 * Mocks MarketplaceService so no real DB/repo is touched.
 * The @platform alias is mocked via the same path the source uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'grammy';
import type { IMarketplaceStrategy, IMarketplaceListing } from '@platform/marketplace/models/types';

const { mockGetDetails, mockList } = vi.hoisted(() => ({
  mockGetDetails: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock('@platform/marketplace/services/marketplace.service', () => ({
  MarketplaceService: {
    getInstance: () => ({
      getStrategyWithDetails: mockGetDetails,
      listStrategies: mockList,
    }),
  },
}));

import { handleCampaign } from '../trading-handlers';

interface ReplyCall { text: string; opts: { parse_mode?: string } | undefined; }

function makeCtx(text: string): { reply: ReturnType<typeof vi.fn>; replies: ReplyCall[] } {
  const replies: ReplyCall[] = [];
  const reply = vi.fn(async (t: string, opts?: { parse_mode?: string }) => { replies.push({ text: t, opts }); });
  return { reply, replies } as unknown as { reply: ReturnType<typeof vi.fn>; replies: ReplyCall[] };
}

function makeStrat(overrides: Partial<IMarketplaceStrategy> = {}): IMarketplaceStrategy {
  return {
    id: 'strat-1',
    tenantId: 't-1',
    creatorId: 'u-1',
    name: 'Momentum Bot',
    description: 'A strategy',
    category: 'momentum',
    status: 'approved',
    riskLevel: 3,
    minAllocationUsd: 100,
    maxAllocationUsd: 1000,
    supportedExchanges: ['polymarket'],
    tags: ['alpha', 'risk'],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('handleCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies "not found" when strategy does not exist', async () => {
    mockGetDetails.mockResolvedValue(null);
    const { reply } = makeCtx('/campaign strat-999');
    await handleCampaign({ message: { text: '/campaign strat-999' }, reply } as unknown as Context);
    expect(mockGetDetails).toHaveBeenCalledWith('strat-999');
    expect(reply).toHaveBeenCalledWith('❌ Strategy not found.');
  });

  it('replies "Could not fetch" when the service throws', async () => {
    mockGetDetails.mockRejectedValue(new Error('DB down'));
    const { reply } = makeCtx('/campaign strat-1');
    await handleCampaign({ message: { text: '/campaign strat-1' }, reply } as unknown as Context);
    expect(reply).toHaveBeenCalledWith('❌ Could not fetch strategy details. Please try again.');
  });

  it('renders strategy detail with free price when no listing', async () => {
    mockGetDetails.mockResolvedValue({ strategy: makeStrat({ name: 'My Bot', riskLevel: 2, tags: ['a', 'b'] }) });
    const { reply } = makeCtx('/campaign strat-1');
    await handleCampaign({ message: { text: '/campaign strat-1' }, reply } as unknown as Context);
    expect(reply).toHaveBeenCalledTimes(1);
    const [text, opts] = reply.mock.calls[0] as [string, { parse_mode?: string }];
    expect(text).toContain('*My Bot*');
    expect(text).toContain('*Price:* Free');
    expect(text).toContain('*Risk Level:* 🔴🔴');
    expect(text).toContain('*Tags:* a, b');
    expect(opts?.parse_mode).toBe('Markdown');
  });

  it('renders strategy detail with monthly price from listing', async () => {
    const listing: IMarketplaceListing = { id: 'l-1', strategyId: 'strat-1', priceUsdMonthly: 2999, status: 'active', createdAt: new Date() };
    mockGetDetails.mockResolvedValue({
      strategy: makeStrat({ riskLevel: 1, tags: ['x'] }),
      listing,
    });
    const { reply } = makeCtx('/campaign strat-1');
    await handleCampaign({ message: { text: '/campaign strat-1' }, reply } as unknown as Context);
    const [text] = reply.mock.calls[0] as [string, { parse_mode?: string }];
    expect(text).toContain('*Price:* $29.99/month');
    expect(text).toContain('*Risk Level:* 🔴');
  });

  it('renders strategy detail with N/A risk when riskLevel is 0', async () => {
    mockGetDetails.mockResolvedValue({ strategy: makeStrat({ riskLevel: 0, tags: [] }) });
    const { reply } = makeCtx('/campaign strat-1');
    await handleCampaign({ message: { text: '/campaign strat-1' }, reply } as unknown as Context);
    const [text] = reply.mock.calls[0] as [string, { parse_mode?: string }];
    expect(text).toContain('*Risk Level:* N/A');
    expect(text).toContain('*Tags:* None');
  });

  it('lists published strategies when no id given', async () => {
    mockList.mockResolvedValue({
      data: [
        makeStrat({ name: 'Bot A', description: 'desc-a' }),
        makeStrat({ id: 'strat-2', name: 'Bot B', description: 'desc-b' }),
      ],
    } as never);
    const { reply } = makeCtx('/campaign');
    await handleCampaign({ message: { text: '/campaign' }, reply } as unknown as Context);
    expect(mockList).toHaveBeenCalledWith({ status: 'approved', limit: 20 });
    const [text, opts] = reply.mock.calls[0] as [string, { parse_mode?: string }];
    expect(text).toContain('*Marketplace Campaigns*');
    expect(text).toContain('1. *Bot A*');
    expect(text).toContain('2. *Bot B*');
    expect(text).toContain('Use /campaign <id> for details.');
    expect(opts?.parse_mode).toBe('Markdown');
  });

  it('replies "no strategies" when marketplace is empty', async () => {
    mockList.mockResolvedValue({ data: [] });
    const { reply } = makeCtx('/campaign');
    await handleCampaign({ message: { text: '/campaign' }, reply } as unknown as Context);
    expect(reply).toHaveBeenCalledWith('📭 No strategies currently available in the marketplace.');
  });

  it('replies "Could not fetch" when list throws', async () => {
    mockList.mockRejectedValue(new Error('down'));
    const { reply } = makeCtx('/campaign');
    await handleCampaign({ message: { text: '/campaign' }, reply } as unknown as Context);
    expect(reply).toHaveBeenCalledWith('❌ Could not fetch marketplace campaigns. Please try again later.');
  });
});
