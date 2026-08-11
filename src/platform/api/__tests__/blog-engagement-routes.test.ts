/**
 * Tests for Blog Engagement Routes
 * Phase 34 Content Personalization — comments, recommendations,
 * page-view analytics, and A/B test tracking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const queryMock = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({
    query: queryMock,
  })),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('./comment-moderation-service', () => ({
  moderateComment: vi.fn().mockResolvedValue({
    approved: true,
    reason: undefined,
    confidenceScore: 8,
  }),
}));

vi.mock('../../../shared/utils/post-similarity-engine', () => ({
  findSimilarPosts: vi.fn().mockReturnValue([
    { id: 'post-2', score: 0.75, matchTags: ['ai'] },
  ]),
}));

vi.mock('../../../desk/jobs/auto-marketing-daemon', () => ({
  getBlogPosts: vi.fn().mockReturnValue([
    {
      id: 'post-1',
      title: 'Post One',
      excerpt: 'First post',
      tags: ['ai'],
      date: '2026-01-01',
    },
    {
      id: 'post-2',
      title: 'Post Two',
      excerpt: 'Second post',
      tags: ['ai', 'strategies'],
      date: '2026-01-02',
    },
  ]),
}));

import { blogEngagementRouter } from '../routes/blog-engagement-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/blog', blogEngagementRouter);
  return app;
}

describe('Blog Engagement Routes', () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('exports the router', () => {
    expect(blogEngagementRouter).toBeTruthy();
  });

  describe('page-view analytics', () => {
    it('rejects page view without postId', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/blog/page-views').send({ viewerId: 'v-1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('records a valid page view (204)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/blog/page-views').send({
        postId: 'post-1',
        viewerId: 'viewer-1',
        viewDurationMs: 45000,
        utm: { source: 'twitter', medium: 'social', campaign: 'launch' },
      });
      expect(res.status).toBe(204);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toContain('INSERT INTO blog_page_views');
      expect(params[0]).toBe('post-1');
      expect(params[6]).toBe(45000);
    });

    it('caps excessive view durations to 24h', async () => {
      const app = buildApp();
      await request(app).post('/api/blog/page-views').send({
        postId: 'post-1',
        viewDurationMs: 9999999999,
      });
      const params = queryMock.mock.calls[0][1];
      expect(params[6]).toBe(24 * 60 * 60 * 1000);
    });

    it('aggregates page-view stats', async () => {
      queryMock.mockResolvedValue({
        rows: [{ post_id: 'post-1', views: 10, avg_duration_ms: 30000 }],
      });
      const app = buildApp();
      const res = await request(app).get('/api/blog/page-views/stats?days=30');
      expect(res.status).toBe(200);
      expect(res.body.windowDays).toBe(30);
      expect(res.body.data).toHaveLength(1);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('blog_page_views');
    });
  });

  describe('comments', () => {
    it('rejects empty comment content (400)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/blog/posts/post-1/comments').send({
        authorName: 'Trader',
        content: '',
      });
      expect(res.status).toBe(400);
    });

    it('submits a moderated comment (201)', async () => {
      const queryMockResolved = vi.fn().mockResolvedValue({
        rows: [{ id: 'comment-1', created_at: '2026-01-01T00:00:00Z' }],
      });
      queryMock.mockImplementation(queryMockResolved);

      const app = buildApp();
      const res = await request(app).post('/api/blog/posts/post-1/comments').send({
        authorName: 'Trader',
        content: 'Great write-up on regime detection!',
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('approved');
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('INSERT INTO blog_comments');
    });

    it('lists approved comments', async () => {
      queryMock.mockResolvedValue({
        rows: [{ id: 'c1', author_name: 'Trader', content: 'Nice', created_at: '2026-01-01T00:00:00Z' }],
      });
      const app = buildApp();
      const res = await request(app).get('/api/blog/posts/post-1/comments');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].authorName).toBe('Trader');
    });
  });

  describe('recommendations', () => {
    it('returns similar posts for an existing post', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/blog/posts/post-1/recommendations?n=5');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('post-2');
      expect(res.body.data[0].similarityScore).toBe(0.75);
      expect(res.body.sourcePostId).toBe('post-1');
    });

    it('returns 404 for unknown post', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/blog/posts/unknown/recommendations');
      expect(res.status).toBe(404);
    });
  });

  describe('A/B testing', () => {
    it('rejects invalid variant (400)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/blog/ab-test/impression').send({
        testId: 'test-1',
        variant: 'C',
      });
      expect(res.status).toBe(400);
    });

    it('records an impression for variant A (204)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/blog/ab-test/impression').send({
        testId: 'test-1',
        variant: 'A',
      });
      expect(res.status).toBe(204);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('impressions_a');
    });

    it('records a click for variant B (204)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/blog/ab-test/click').send({
        testId: 'test-1',
        variant: 'B',
      });
      expect(res.status).toBe(204);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('clicks_b');
    });
  });
});
