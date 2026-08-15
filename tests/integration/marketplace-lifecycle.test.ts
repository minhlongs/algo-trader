/**
 * Marketplace Lifecycle Integration Test
 * E2E HTTP flow: strategy creation, subscription, review,
 * dispute, and creator revenue via Express + supertest.
 * All service singletons are mocked at module level via getInstance().
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const {
  mockMarketplaceService,
  mockSubscriptionService,
  mockAuditLogService,
  mockDisputeService,
  mockRevenueShareRepository,
} = vi.hoisted(() => ({
  mockMarketplaceService: {
    createStrategy: vi.fn(),
    getStrategy: vi.fn(),
    listStrategies: vi.fn(),
    queueVettingJob: vi.fn().mockResolvedValue(undefined),
    createListing: vi.fn().mockResolvedValue({
      id: 'listing-001', strategyId: 'strat-001', status: 'pending_vetting',
    }),
  },
  mockSubscriptionService: {
    subscribe: vi.fn(),
    hasActiveSubscription: vi.fn(),
    createReview: vi.fn(),
  },
  mockAuditLogService: { log: vi.fn() },
  mockDisputeService: {
    getSubscriptionForDispute: vi.fn(),
    fileDispute: vi.fn(),
  },
  mockRevenueShareRepository: {
    getCreatorTotals: vi.fn(),
    findAll: vi.fn(),
  },
}));

vi.mock('../../src/platform/middleware/feature-gate', () => ({
  requireTier: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../src/platform/marketplace/services/marketplace.service', () => ({
  MarketplaceService: { getInstance: () => mockMarketplaceService },
}));
vi.mock('../../src/platform/marketplace/services/subscription.service', () => ({
  SubscriptionService: { getInstance: () => mockSubscriptionService },
}));
vi.mock('../../src/platform/audit/audit-log-service', () => ({
  AuditLogService: { getInstance: () => mockAuditLogService },
}));
vi.mock('../../src/platform/marketplace/services/dispute.service', () => ({
  DisputeService: { getInstance: () => mockDisputeService },
}));
vi.mock('../../src/platform/marketplace/repositories/revenue-share-repository', () => ({
  revenueShareRepository: mockRevenueShareRepository,
}));

import { marketplaceStrategyListingsRouter } from '../../src/platform/api/routes/marketplace-strategy-listings-routes';
import marketplaceSubscriptionRouter from '../../src/platform/api/routes/marketplace-subscription-routes';
import marketplaceReviewRouter from '../../src/platform/api/routes/marketplace-review-routes';
import marketplaceDisputeRouter from '../../src/platform/api/routes/marketplace-dispute-routes';
import marketplaceCreatorRevenueRouter from '../../src/platform/api/routes/marketplace-creator-revenue-routes';

function attachTenantContext(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
): void {
  (req as { tenant?: { id: string; tier?: string }; user?: { id: string } }).tenant = {
    id: 'tenant-abc', tier: 'PRO',
  };
  (req as { tenant?: { id: string; tier?: string }; user?: { id: string } }).user = {
    id: 'user-001',
  };
  next();
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(attachTenantContext);
  app.use('/api/marketplace/strategies', marketplaceStrategyListingsRouter);
  app.use('/api/marketplace/subscriptions', marketplaceSubscriptionRouter);
  app.use('/api/marketplace/reviews', marketplaceReviewRouter);
  app.use('/api/marketplace/disputes', marketplaceDisputeRouter);
  app.use('/api/marketplace/creator-revenue', marketplaceCreatorRevenueRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

describe('Marketplace Lifecycle (E2E)', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });
  it('POST /api/marketplace/strategies/publish — creates strategy', async () => {
    mockMarketplaceService.createStrategy.mockResolvedValue({
      id: 'strat-001', tenantId: 'tenant-abc', name: 'Momentum Alpha',
      category: 'momentum', status: 'draft',
    });
    const res = await request(app)
      .post('/api/marketplace/strategies/publish')
      .send({
        name: 'Momentum Alpha',
        description: 'Momentum-based alpha strategy for BTC/USDT pairs with proven backtested results.',
        category: 'momentum',
        riskLevel: 5,
        minAllocationUsd: 500,
        maxAllocationUsd: 10000,
        backtestSummary: { sharpe: 1.8, maxDrawdown: 12, winRate: 62, periodDays: 365 },
      });
    expect(res.status).toBe(201);
    expect(res.body.strategy.id).toBe('strat-001');
    expect(mockMarketplaceService.createStrategy).toHaveBeenCalledOnce();
  });

  it('POST /api/marketplace/subscriptions — subscribes to listing', async () => {
    mockSubscriptionService.subscribe.mockResolvedValue({
      subscription: {
        id: 'sub-001', listingId: 'listing-abc', status: 'active', allocationPercent: 25,
      },
      checkoutUrl: null,
    });
    const res = await request(app)
      .post('/api/marketplace/subscriptions')
      .send({ listingId: 'listing-abc', allocationPercent: 25 });
    expect(res.status).toBe(201);
    expect(res.body.subscription.id).toBe('sub-001');
    expect(res.body.subscription.status).toBe('active');
    expect(res.body.checkoutUrl).toBeNull();
  });

  it('POST /api/marketplace/reviews — leaves review for subscribed strategy', async () => {
    mockMarketplaceService.getStrategy.mockResolvedValue({
      id: 'strat-001', status: 'approved', name: 'Momentum Alpha',
    });
    mockSubscriptionService.hasActiveSubscription.mockResolvedValue(true);
    mockSubscriptionService.createReview.mockResolvedValue({
      id: 'rev-001', strategyId: 'strat-001', rating: 5,
      comment: 'Excellent strategy with consistent returns over the past quarter',
    });
    const res = await request(app)
      .post('/api/marketplace/reviews')
      .send({
        strategyId: 'strat-001',
        rating: 5,
        comment: 'Excellent strategy with consistent returns over the past quarter',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('rev-001');
    expect(res.body.rating).toBe(5);
    expect(mockSubscriptionService.hasActiveSubscription).toHaveBeenCalledWith(
      'tenant-abc', 'strat-001',
    );
  });

  it('POST /api/marketplace/disputes — opens dispute on subscription', async () => {
    mockDisputeService.getSubscriptionForDispute.mockResolvedValue({
      id: 'sub-001', tenantId: 'tenant-abc', listingId: 'listing-abc', status: 'active',
    });
    mockDisputeService.fileDispute.mockResolvedValue({
      id: 'disp-001', listingId: 'listing-abc', subscriptionId: 'sub-001',
      reason: 'performance_not_as_described', status: 'open',
    });
    const res = await request(app)
      .post('/api/marketplace/disputes')
      .send({
        listingId: 'listing-abc',
        subscriptionId: 'sub-001',
        reason: 'performance_not_as_described',
        description:
          'Strategy returned -15% in first month despite advertised +5% monthly returns on the listing page.',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('disp-001');
    expect(res.body.reason).toBe('performance_not_as_described');
    expect(mockDisputeService.fileDispute).toHaveBeenCalledOnce();
  });

  it('GET /api/marketplace/creator-revenue/dashboard — returns revenue data', async () => {
    mockRevenueShareRepository.getCreatorTotals.mockResolvedValue({
      totalRevenue: 125000, totalPayouts: 100000, pending: 25000,
    });
    mockRevenueShareRepository.findAll.mockResolvedValue({
      data: [], total: 0, page: 1, limit: 5,
    });
    const res = await request(app).get('/api/marketplace/creator-revenue/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.totalEarningsCents).toBe(125000);
    expect(res.body.pendingPayoutCents).toBe(25000);
    expect(res.body.tenantId).toBe('tenant-abc');
    expect(mockRevenueShareRepository.getCreatorTotals).toHaveBeenCalledWith('tenant-abc');
  });
});
