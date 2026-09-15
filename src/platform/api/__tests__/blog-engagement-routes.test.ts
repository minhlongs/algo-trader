import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from './blog-engagement-fixtures';

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

import { blogEngagementRouter } from '../routes/blog-engagement-routes';

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
      const app = buildApp(blogEngagementRouter);
      const res = await request(app).post('/api/blog/page-views').send({ viewerId: 'v-1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('records a valid page view (204)', async () => {
      const app = buildApp(blogEngagementRouter);
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
      const app = buildApp(blogEngagementRouter);
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
      const app = buildApp(blogEngagementRouter);
      const res = await request(app).get('/api/blog/page-views/stats?days=30');
      expect(res.status).toBe(200);
      expect(res.body.windowDays).toBe(30);
      expect(res.body.data).toHaveLength(1);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('blog_page_views');
    });
  });

  describe('A/B testing', () => {
    it('rejects invalid variant (400)', async () => {
      const app = buildApp(blogEngagementRouter);
      const res = await request(app).post('/api/blog/ab-test/impression').send({
        testId: 'test-1',
        variant: 'C',
      });
      expect(res.status).toBe(400);
    });

    it('records an impression for variant A (204)', async () => {
      const app = buildApp(blogEngagementRouter);
      const res = await request(app).post('/api/blog/ab-test/impression').send({
        testId: 'test-1',
        variant: 'A',
      });
      expect(res.status).toBe(204);
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('impressions_a');
    });

    it('records a click for variant B (204)', async () => {
      const app = buildApp(blogEngagementRouter);
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
