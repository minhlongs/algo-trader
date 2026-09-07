/**
 * Marketplace Review Routes — Comprehensive Coverage Tests
 *
 * Covers src/platform/api/routes/marketplace-review-routes.ts:
 * - POST / (create review): validation errors, strategy not found,
 *   strategy not approved, no subscription, success, audit log, 500 error
 * - GET /strategies/:id: validation, not found, pagination, success, 500
 * - POST /:id/helpful: not found, flagged review, success, audit log, 500
 * - POST /:id/report: not found, success, audit log, 500
 * - Helper functions: getTenantId, getUserId, getQueryString, getQueryNumber, isAdmin
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Hoisted mocks
const mocks = vi.hoisted(() => {
  const hasActiveSubscription = vi.fn();
  const createReview = vi.fn();
  const getReview = vi.fn();
  const markReviewHelpful = vi.fn();
  const flagReview = vi.fn();
  const getStrategy = vi.fn();
  const getStrategyWithDetails = vi.fn();
  const log = vi.fn();

  let allowTier = true;

  return {
    hasActiveSubscription,
    createReview,
    getReview,
    markReviewHelpful,
    flagReview,
    getStrategy,
    getStrategyWithDetails,
    log,
    allowTier,
    // requireTier mock: factory that ignores tier arg, returns middleware
    makeRequireTier: () =>
      ((_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }, next: () => void) => {
        if (mocks.allowTier) next();
        else res.status(403).json({ error: 'Insufficient tier' });
      }) as any,
  };
});

// Mock subscription service module
vi.mock('../../../marketplace/services/subscription.service', () => ({
  SubscriptionService: {
    getInstance: () => ({
      hasActiveSubscription: mocks.hasActiveSubscription,
      createReview: mocks.createReview,
      getReview: mocks.getReview,
      markReviewHelpful: mocks.markReviewHelpful,
      flagReview: mocks.flagReview,
    }),
  },
}));

// Mock marketplace service module
vi.mock('../../../marketplace/services/marketplace.service', () => ({
  MarketplaceService: {
    getInstance: () => ({
      getStrategy: mocks.getStrategy,
      getStrategyWithDetails: mocks.getStrategyWithDetails,
    }),
  },
}));

// Mock audit log service
vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      log: mocks.log,
    }),
  },
}));

// Mock logger
vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock feature-gate — requireTier is a factory: requireTier('FREE') returns middleware
vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => mocks.makeRequireTier(),
}));

// Import AFTER mocks
import { marketplaceReviewRouter, getQueryString } from '../marketplace-review-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenant = { id: 'tenant-1' };
    (req as any).user = { id: 'user-1', tenantId: 'tenant-1' };
    next();
  });
  app.use('/api/v1/marketplace/reviews', marketplaceReviewRouter);
  return app;
}

const VALID_REVIEW_BODY = {
  strategyId: 'strat-123',
  rating: 5,
  comment: 'Excellent strategy with consistent returns!',
};

const VALID_STRATEGY = {
  id: 'strat-123',
  name: 'Alpha Strategy',
  status: 'approved',
  tenantId: 'creator-1',
};

const VALID_REVIEW = {
  id: 'rev-1',
  strategyId: 'strat-123',
  tenantId: 'tenant-1',
  userId: 'user-1',
  rating: 5,
  comment: 'Great!',
  isFlagged: false,
  helpfulVotes: 0,
  reportedCount: 0,
  createdAt: '2026-09-01',
};

const FLAGGED_REVIEW = {
  ...VALID_REVIEW,
  id: 'rev-flagged',
  isFlagged: true,
};

const STRATEGY_WITH_DETAILS = {
  strategy: VALID_STRATEGY,
  reviews: [VALID_REVIEW],
};

describe('marketplaceReviewRouter — marketplace-review-routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowTier = true;
    mocks.hasActiveSubscription.mockReset();
    mocks.createReview.mockReset();
    mocks.getReview.mockReset();
    mocks.markReviewHelpful.mockReset();
    mocks.flagReview.mockReset();
    mocks.getStrategy.mockReset();
    mocks.getStrategyWithDetails.mockReset();
    mocks.log.mockReset();
  });

  // ============================================================
  // POST / — Create Review
  // ============================================================
  describe('POST / — create review', () => {
    it('returns 400 with details when body validation fails (missing fields)', async () => {
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send({ strategyId: 'strat-123' }); // missing rating + comment

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
      expect(res.body.details).toBeDefined();
      expect(mocks.createReview).not.toHaveBeenCalled();
    });

    it('returns 400 when rating is out of range (0)', async () => {
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send({ strategyId: 'strat-123', rating: 0, comment: 'Valid comment text here' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    });

    it('returns 400 when rating is out of range (6)', async () => {
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send({ strategyId: 'strat-123', rating: 6, comment: 'Valid comment text here' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when comment is too short', async () => {
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send({ strategyId: 'strat-123', rating: 3, comment: 'short' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when comment exceeds max length', async () => {
      const longComment = 'x'.repeat(2001);
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send({ strategyId: 'strat-123', rating: 3, comment: longComment });

      expect(res.status).toBe(400);
    });

    it('returns 404 when strategy not found', async () => {
      mocks.getStrategy.mockResolvedValue(null);

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send(VALID_REVIEW_BODY);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
      expect(res.body.message).toContain('strat-123');
      expect(mocks.createReview).not.toHaveBeenCalled();
    });

    it('returns 400 when strategy is not approved', async () => {
      mocks.getStrategy.mockResolvedValue({ ...VALID_STRATEGY, status: 'pending_review' });

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send(VALID_REVIEW_BODY);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request');
      expect(res.body.message).toContain('not approved');
      expect(mocks.createReview).not.toHaveBeenCalled();
    });

    it('returns 403 when tenant has no active subscription', async () => {
      mocks.getStrategy.mockResolvedValue(VALID_STRATEGY);
      mocks.hasActiveSubscription.mockResolvedValue(false);

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send(VALID_REVIEW_BODY);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(res.body.message).toContain('subscriber');
      expect(mocks.createReview).not.toHaveBeenCalled();
    });

    it('returns 201 with review on success', async () => {
      mocks.getStrategy.mockResolvedValue(VALID_STRATEGY);
      mocks.hasActiveSubscription.mockResolvedValue(true);
      mocks.createReview.mockResolvedValue(VALID_REVIEW);

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send(VALID_REVIEW_BODY);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(VALID_REVIEW);
      expect(mocks.createReview).toHaveBeenCalledWith({
        strategyId: 'strat-123',
        tenantId: expect.any(String),
        userId: expect.any(String),
        rating: 5,
        comment: 'Excellent strategy with consistent returns!',
      });
    });

    it('logs audit event on successful review creation', async () => {
      mocks.getStrategy.mockResolvedValue(VALID_STRATEGY);
      mocks.hasActiveSubscription.mockResolvedValue(true);
      mocks.createReview.mockResolvedValue(VALID_REVIEW);

      await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send(VALID_REVIEW_BODY);

      expect(mocks.log).toHaveBeenCalledWith(
        expect.any(String),
        'api_call',
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'review_created',
            strategyId: 'strat-123',
            rating: 5,
          }),
        })
      );
    });

    it('returns 500 when createReview throws', async () => {
      mocks.getStrategy.mockResolvedValue(VALID_STRATEGY);
      mocks.hasActiveSubscription.mockResolvedValue(true);
      mocks.createReview.mockRejectedValue(new Error('DB error'));

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send(VALID_REVIEW_BODY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('handles boundary rating 1 and 5', async () => {
      mocks.getStrategy.mockResolvedValue(VALID_STRATEGY);
      mocks.hasActiveSubscription.mockResolvedValue(true);
      mocks.createReview.mockResolvedValue({ ...VALID_REVIEW, rating: 1 });

      const res1 = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send({ strategyId: 'strat-123', rating: 1, comment: 'Minimum rating comment ok' });
      expect(res1.status).toBe(201);

      mocks.createReview.mockResolvedValue({ ...VALID_REVIEW, rating: 5 });
      const res5 = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send({ strategyId: 'strat-123', rating: 5, comment: 'Maximum rating comment ok' });
      expect(res5.status).toBe(201);
    });
  });

  // ============================================================
  // GET /strategies/:id — List Reviews
  // ============================================================
  describe('GET /strategies/:id — list reviews', () => {
    it('returns 400 when query params are invalid (negative page)', async () => {
      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123?page=-1');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    it('returns 400 when limit exceeds max', async () => {
      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123?limit=101');

      expect(res.status).toBe(400);
    });

    it('returns 404 when strategy not found', async () => {
      mocks.getStrategyWithDetails.mockResolvedValue(null);

      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('returns 200 with paginated reviews', async () => {
      const manyReviews = Array.from({ length: 5 }, (_, i) => ({
        ...VALID_REVIEW,
        id: `rev-${i}`,
      }));
      mocks.getStrategyWithDetails.mockResolvedValue({
        strategy: VALID_STRATEGY,
        reviews: manyReviews,
      });

      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123?page=1&limit=3');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.total).toBe(5);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(3);
      expect(res.body.totalPages).toBe(2);
    });

    it('handles second page correctly', async () => {
      const manyReviews = Array.from({ length: 5 }, (_, i) => ({
        ...VALID_REVIEW,
        id: `rev-${i}`,
      }));
      mocks.getStrategyWithDetails.mockResolvedValue({
        strategy: VALID_STRATEGY,
        reviews: manyReviews,
      });

      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123?page=2&limit=3');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].id).toBe('rev-3');
    });

    it('uses default page=1 and limit=20', async () => {
      mocks.getStrategyWithDetails.mockResolvedValue(STRATEGY_WITH_DETAILS);

      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123');

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
    });

    it('handles empty reviews array', async () => {
      mocks.getStrategyWithDetails.mockResolvedValue({
        strategy: VALID_STRATEGY,
        reviews: [],
      });

      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(0);
    });

    it('returns 500 when service throws', async () => {
      mocks.getStrategyWithDetails.mockRejectedValue(new Error('DB error'));

      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ============================================================
  // POST /:id/helpful — Mark Helpful
  // ============================================================
  describe('POST /:id/helpful — mark helpful', () => {
    it('returns 404 when review not found', async () => {
      mocks.getReview.mockResolvedValue(null);

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/nonexistent/helpful');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
      expect(res.body.message).toContain('nonexistent');
    });

    it('returns 400 when review is flagged', async () => {
      mocks.getReview.mockResolvedValue(FLAGGED_REVIEW);

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-flagged/helpful');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request');
      expect(res.body.message).toContain('flagged');
    });

    it('returns 200 with updated review on success', async () => {
      mocks.getReview.mockResolvedValue(VALID_REVIEW);
      mocks.markReviewHelpful.mockResolvedValue({ ...VALID_REVIEW, helpfulVotes: 1 });

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/helpful');

      expect(res.status).toBe(200);
      expect(res.body.helpfulVotes).toBe(1);
      expect(mocks.markReviewHelpful).toHaveBeenCalledWith('rev-1');
    });

    it('logs audit event on marking helpful', async () => {
      mocks.getReview.mockResolvedValue(VALID_REVIEW);
      mocks.markReviewHelpful.mockResolvedValue({ ...VALID_REVIEW, helpfulVotes: 2 });

      await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/helpful');

      expect(mocks.log).toHaveBeenCalledWith(
        expect.any(String),
        'api_call',
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'review_marked_helpful',
            resourceId: 'rev-1',
            strategyId: 'strat-123',
          }),
        })
      );
    });

    it('returns 500 when markReviewHelpful throws', async () => {
      mocks.getReview.mockResolvedValue(VALID_REVIEW);
      mocks.markReviewHelpful.mockRejectedValue(new Error('DB error'));

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/helpful');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ============================================================
  // POST /:id/report — Flag Review
  // ============================================================
  describe('POST /:id/report — flag review', () => {
    it('returns 404 when review not found', async () => {
      mocks.getReview.mockResolvedValue(null);

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/nonexistent/report');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('returns 200 with flagged review on success', async () => {
      mocks.getReview.mockResolvedValue(VALID_REVIEW);
      mocks.flagReview.mockResolvedValue({ ...VALID_REVIEW, isFlagged: true });

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/report');

      expect(res.status).toBe(200);
      expect(res.body.isFlagged).toBe(true);
      expect(mocks.flagReview).toHaveBeenCalledWith('rev-1');
    });

    it('logs audit event on reporting', async () => {
      mocks.getReview.mockResolvedValue(VALID_REVIEW);
      mocks.flagReview.mockResolvedValue({ ...VALID_REVIEW, isFlagged: true });

      await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/report');

      expect(mocks.log).toHaveBeenCalledWith(
        expect.any(String),
        'api_call',
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'review_reported',
            resourceId: 'rev-1',
            strategyId: 'strat-123',
          }),
        })
      );
    });

    it('returns 500 when flagReview throws', async () => {
      mocks.getReview.mockResolvedValue(VALID_REVIEW);
      mocks.flagReview.mockRejectedValue(new Error('DB error'));

      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/report');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ============================================================
  // Tier gate
  // ============================================================
  describe('tier gate', () => {
    it('blocks POST / when tier check fails', async () => {
      mocks.allowTier = false;
      // Re-import to pick up new mock behavior — but we set allowTier=false
      // The mock already uses mocks.allowTier, so just test it
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews')
        .send(VALID_REVIEW_BODY);

      expect(res.status).toBe(403);
    });

    it('blocks GET /strategies/:id when tier check fails', async () => {
      mocks.allowTier = false;
      const res = await request(buildApp())
        .get('/api/v1/marketplace/reviews/strategies/strat-123');

      expect(res.status).toBe(403);
    });

    it('blocks POST /:id/helpful when tier check fails', async () => {
      mocks.allowTier = false;
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/helpful');

      expect(res.status).toBe(403);
    });

    it('blocks POST /:id/report when tier check fails', async () => {
      mocks.allowTier = false;
      const res = await request(buildApp())
        .post('/api/v1/marketplace/reviews/rev-1/report');

      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // Helper Functions
  // ============================================================
  describe('getQueryString', () => {
    it('returns default when value is undefined', () => {
      expect(getQueryString(undefined)).toBe('');
    });

    it('returns default when value is null', () => {
      expect(getQueryString(null, 'fallback')).toBe('fallback');
    });

    it('returns first element when value is array', () => {
      expect(getQueryString(['a', 'b'])).toBe('a');
    });

    it('stringifies non-string first array element', () => {
      expect(getQueryString([42])).toBe('42');
    });

    it('returns string value directly', () => {
      expect(getQueryString('hello')).toBe('hello');
    });

    it('stringifies number value', () => {
      expect(getQueryString(123)).toBe('123');
    });
  });
});
