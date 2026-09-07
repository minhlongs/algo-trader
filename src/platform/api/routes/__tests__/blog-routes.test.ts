/**
 * Tests for blog-routes — blogRouter.
 *
 * Covers: GET /api/blog/posts — limit parsing (default, explicit, out-of-range),
 * and delegation to getBlogPosts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetBlogPosts } = vi.hoisted(() => ({
  mockGetBlogPosts: vi.fn(),
}));
vi.mock('../../../../desk/jobs/auto-marketing-daemon', () => ({
  getBlogPosts: mockGetBlogPosts,
}));

import { blogRouter } from '../blog-routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function invokeGetPosts(query: Record<string, string> = {}): {
  status: number;
  body: unknown;
  next: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res: any = { status, json };
  const req: any = { query };
  const next = vi.fn();

  const handlers = (blogRouter as any).stack
    .filter((l: any) => l.route && l.route.path === '/posts')
    .map((l: any) => l.route.stack[0].handle);

  expect(handlers.length).toBe(1);
  handlers[0](req, res, next);

  return { status: status.mock.calls[0]?.[0] ?? 200, body: json.mock.calls[0]?.[0], next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('blogRouter GET /posts', () => {
  it('defaults limit to 10 when no query param', () => {
    mockGetBlogPosts.mockReturnValue([{ id: 'p1' }]);
    const { body } = invokeGetPosts();
    expect(mockGetBlogPosts).toHaveBeenCalledWith(10);
    expect(body).toEqual([{ id: 'p1' }]);
  });

  it('parses a valid numeric limit', () => {
    mockGetBlogPosts.mockReturnValue([]);
    invokeGetPosts({ limit: '25' });
    expect(mockGetBlogPosts).toHaveBeenCalledWith(25);
  });

  it('falls back to 10 when limit is NaN', () => {
    mockGetBlogPosts.mockReturnValue([]);
    invokeGetPosts({ limit: 'abc' });
    expect(mockGetBlogPosts).toHaveBeenCalledWith(10);
  });

  it('falls back to 10 when limit is empty string', () => {
    mockGetBlogPosts.mockReturnValue([]);
    invokeGetPosts({ limit: '' });
    expect(mockGetBlogPosts).toHaveBeenCalledWith(10);
  });

  it('clamps limit below 1 to 1', () => {
    mockGetBlogPosts.mockReturnValue([]);
    invokeGetPosts({ limit: '-5' });
    expect(mockGetBlogPosts).toHaveBeenCalledWith(1);
  });

  it('clamps limit above 50 to 50', () => {
    mockGetBlogPosts.mockReturnValue([]);
    invokeGetPosts({ limit: '999' });
    expect(mockGetBlogPosts).toHaveBeenCalledWith(50);
  });

  it('returns JSON via res.json', () => {
    const posts = [{ id: 'p1' }, { id: 'p2' }];
    mockGetBlogPosts.mockReturnValue(posts);
    const { body } = invokeGetPosts({ limit: '5' });
    expect(body).toEqual(posts);
  });
});