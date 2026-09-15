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

vi.mock('../routes/comment-moderation-service', () => ({
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

describe('Blog Engagement Content & Recommendations', () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  describe('comments', () => {
    it('rejects empty comment content (400)', async () => {
      const app = buildApp(blogEngagementRouter);
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

      const app = buildApp(blogEngagementRouter);
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
      const app = buildApp(blogEngagementRouter);
      const res = await request(app).get('/api/blog/posts/post-1/comments');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].authorName).toBe('Trader');
    });
  });

  describe('recommendations', () => {
    it('returns similar posts for an existing post', async () => {
      const app = buildApp(blogEngagementRouter);
      const res = await request(app).get('/api/blog/posts/post-1/recommendations?n=5');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('post-2');
      expect(res.body.data[0].similarityScore).toBe(0.75);
      expect(res.body.sourcePostId).toBe('post-1');
    });

    it('returns 404 for unknown post', async () => {
      const app = buildApp(blogEngagementRouter);
      const res = await request(app).get('/api/blog/posts/unknown/recommendations');
      expect(res.status).toBe(404);
    });
  });
});
