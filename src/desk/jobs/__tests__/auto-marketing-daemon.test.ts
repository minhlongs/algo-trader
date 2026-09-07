/**
 * Tests for auto-marketing daemon
 * Validates content generation, runAutoMarketing flow, and CLI entry point
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockReadJson, mockWriteJson, mockGenerateLlmBlogPost, mockDistributePost, mockLogger } = vi.hoisted(() => ({
  mockReadJson: vi.fn(),
  mockWriteJson: vi.fn(),
  mockGenerateLlmBlogPost: vi.fn(),
  mockDistributePost: vi.fn().mockResolvedValue(undefined),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../shared/persistence/persistent-store', () => ({
  readJson: mockReadJson,
  writeJson: mockWriteJson,
}));
vi.mock('../llm-content-generator', () => ({
  generateLlmBlogPost: mockGenerateLlmBlogPost,
}));
vi.mock('../social-auto-poster', () => ({
  distributePost: mockDistributePost,
}));
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return { ...actual, join: (...args: string[]) => args.join('/') };
});

import {
  generateSignalDigest,
  generatePerformanceReport,
  generateStrategySpotlight,
  getBlogPosts,
  runAutoMarketing,
} from '../auto-marketing-daemon';

function mockPost(overrides: Partial<{ id: string; title: string; generatedAt: string; type: string }> = {}) {
  return {
    id: overrides.id ?? 'mock-post-1',
    title: overrides.title ?? 'Test Post',
    excerpt: 'excerpt',
    content: 'content',
    date: 'January 1, 2026',
    tags: ['Test'],
    type: (overrides.type ?? 'signal-digest') as 'signal-digest',
    url: '#',
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
  };
}

describe('AutoMarketing Daemon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadJson.mockReset();
    mockWriteJson.mockReset();
    mockGenerateLlmBlogPost.mockReset();
    mockDistributePost.mockReset();
    mockReadJson.mockReturnValue(undefined);
    mockGenerateLlmBlogPost.mockImplementation((_type: string, fallback: () => unknown) => Promise.resolve(fallback()));
    mockDistributePost.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Generators ─────────────────────────────────────────────────────────────

  describe('generateSignalDigest', () => {
    it('generates signal digest with required fields', () => {
      const post = generateSignalDigest();
      expect(post.id).toBeTruthy();
      expect(post.title).toContain('Signal Digest');
      expect(post.excerpt).toBeTruthy();
      expect(post.content).toContain('52+ strategy engine');
      expect(post.type).toBe('signal-digest');
      expect(post.tags).toContain('Signals');
      expect(post.date).toBeTruthy();
      expect(post.generatedAt).toBeTruthy();
    });

    it('generates unique IDs for each post', () => {
      const a = generateSignalDigest();
      const b = generateSignalDigest();
      expect(a.id).not.toBe(b.id);
    });

    it('contains all required content elements', () => {
      const post = generateSignalDigest();
      expect(post.content).toContain('Top Signals');
      expect(post.content).toContain('Market Conditions');
      expect(post.content).toContain('Kelly');
      expect(post.url).toBe('#');
    });
  });

  describe('generatePerformanceReport', () => {
    it('generates performance report with metrics', () => {
      const post = generatePerformanceReport();
      expect(post.title).toContain('Performance');
      expect(post.content).toContain('P&L');
      expect(post.content).toContain('Win Rate');
      expect(post.content).toContain('Sharpe Ratio');
      expect(post.type).toBe('performance');
      expect(post.tags).toContain('Performance');
    });

    it('includes strategy breakdown section', () => {
      const post = generatePerformanceReport();
      expect(post.content).toContain('Strategy Breakdown');
      expect(post.content).toContain('Endgame');
      expect(post.content).toContain('Whale Copy');
    });
  });

  describe('generateStrategySpotlight', () => {
    it('generates strategy spotlight', () => {
      const post = generateStrategySpotlight();
      expect(post.title).toContain('Strategy Spotlight');
      expect(post.content).toContain('Kelly Criterion');
      expect(post.type).toBe('strategy-spotlight');
      expect(post.tags.length).toBeGreaterThanOrEqual(2);
    });

    it('includes overview and results sections', () => {
      const post = generateStrategySpotlight();
      expect(post.content).toContain('Overview');
      expect(post.content).toContain('Why It Works');
      expect(post.content).toContain('Results');
    });
  });

  // ── getBlogPosts ───────────────────────────────────────────────────────────

  describe('getBlogPosts', () => {
    it('reads posts from persistence layer', () => {
      const posts = [mockPost({ id: 'p1' }), mockPost({ id: 'p2' })];
      mockReadJson.mockReturnValue(posts);
      const result = getBlogPosts(10);
      expect(result).toHaveLength(2);
      expect(mockReadJson).toHaveBeenCalled();
    });

    it('respects limit parameter', () => {
      const posts = Array.from({ length: 20 }, (_, i) => mockPost({ id: `p${i}` }));
      mockReadJson.mockReturnValue(posts);
      const result = getBlogPosts(5);
      expect(result).toHaveLength(5);
      expect(result[0].id).toBe('p0');
      expect(result[4].id).toBe('p4');
    });

    it('returns empty array when readJson returns undefined', () => {
      mockReadJson.mockReturnValue(undefined);
      expect(getBlogPosts()).toEqual([]);
    });

    it('defaults limit to 10', () => {
      const posts = Array.from({ length: 15 }, (_, i) => mockPost({ id: `p${i}` }));
      mockReadJson.mockReturnValue(posts);
      expect(getBlogPosts()).toHaveLength(10);
    });
  });

  // ── runAutoMarketing ───────────────────────────────────────────────────────

  describe('runAutoMarketing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('skips generation when 2+ posts already exist today', async () => {
      vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
      const todayIso = '2026-09-06T10:00:00.000Z';
      mockReadJson.mockReturnValue([
        mockPost({ id: 'old-1', generatedAt: '2026-09-05T10:00:00.000Z' }),
        mockPost({ id: 'today-1', generatedAt: todayIso }),
        mockPost({ id: 'today-2', generatedAt: todayIso }),
      ]);

      await runAutoMarketing();

      expect(mockGenerateLlmBlogPost).not.toHaveBeenCalled();
      expect(mockWriteJson).not.toHaveBeenCalled();
      expect(mockDistributePost).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Already generated'),
      );
    });

    it('generates digest on a non-special day (Friday)', async () => {
      vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
      const digest = mockPost({ id: 'digest-1', title: 'Friday Signal Digest' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest);

      await runAutoMarketing();

      expect(mockGenerateLlmBlogPost).toHaveBeenCalledWith(
        'signal-digest',
        expect.any(Function),
      );
      expect(mockWriteJson).toHaveBeenCalled();
      expect(mockDistributePost).toHaveBeenCalledWith(digest);
    });

    it('generates weekly report on Mondays', async () => {
      vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
      const digest = mockPost({ id: 'd', title: 'Signal Digest' });
      const report = mockPost({ id: 'r', title: 'Weekly Report', type: 'performance' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest).mockResolvedValueOnce(report);

      await runAutoMarketing();

      expect(mockGenerateLlmBlogPost).toHaveBeenCalledTimes(2);
      expect(mockGenerateLlmBlogPost).toHaveBeenCalledWith(
        'performance',
        expect.any(Function),
      );
      const savedPosts = mockWriteJson.mock.calls[0][1];
      expect(savedPosts[0].id).toBe('r');
    });

    it('generates strategy spotlight on Thursdays', async () => {
      vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
      const digest = mockPost({ id: 'd', title: 'Signal Digest' });
      const spotlight = mockPost({ id: 's', title: 'Strategy Spotlight', type: 'strategy-spotlight' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest).mockResolvedValueOnce(spotlight);

      await runAutoMarketing();

      expect(mockGenerateLlmBlogPost).toHaveBeenCalledTimes(2);
      expect(mockGenerateLlmBlogPost).toHaveBeenCalledWith(
        'strategy-spotlight',
        expect.any(Function),
      );
      const savedPosts = mockWriteJson.mock.calls[0][1];
      expect(savedPosts[0].id).toBe('s');
    });

    it('distributes the latest post via social channels', async () => {
      vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
      const digest = mockPost({ id: 'd', title: 'Test Post' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest);

      await runAutoMarketing();

      expect(mockDistributePost).toHaveBeenCalledTimes(1);
      expect(mockDistributePost).toHaveBeenCalledWith(digest);
    });

    it('generates when exactly one post exists today (below the 2-post skip threshold)', async () => {
      vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
      mockReadJson.mockReturnValue([
        mockPost({ id: 'today-1', generatedAt: '2026-09-05T10:00:00.000Z' }),
      ]);
      const digest = mockPost({ id: 'new-1' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest);

      await runAutoMarketing();

      expect(mockGenerateLlmBlogPost).toHaveBeenCalledTimes(1);
      expect(mockWriteJson).toHaveBeenCalled();
      expect(mockDistributePost).toHaveBeenCalledWith(digest);
    });

    it('trims posts to 50 when over limit', async () => {
      vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
      const existing = Array.from({ length: 50 }, (_, i) =>
        mockPost({ id: `old-${i}`, generatedAt: '2026-09-04T10:00:00.000Z' }),
      );
      mockReadJson.mockReturnValue(existing);
      const digest = mockPost({ id: 'new-1' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest);

      await runAutoMarketing();

      const savedPosts = mockWriteJson.mock.calls[0][1];
      expect(savedPosts).toHaveLength(50);
      expect(savedPosts[0].id).toBe('new-1');
    });

    it('prepends new posts before existing ones', async () => {
      vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
      mockReadJson.mockReturnValue([mockPost({ id: 'old-1' })]);
      const digest = mockPost({ id: 'new-1' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest);

      await runAutoMarketing();

      const savedPosts = mockWriteJson.mock.calls[0][1];
      expect(savedPosts[0].id).toBe('new-1');
      expect(savedPosts[1].id).toBe('old-1');
    });

    it('handles empty post list from persistence', async () => {
      vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
      const digest = mockPost({ id: 'd' });
      mockGenerateLlmBlogPost.mockResolvedValueOnce(digest);

      await runAutoMarketing();

      expect(mockGenerateLlmBlogPost).toHaveBeenCalledTimes(1);
      expect(mockWriteJson).toHaveBeenCalledTimes(1);
      const savedPosts = mockWriteJson.mock.calls[0][1];
      expect(savedPosts).toHaveLength(1);
    });

    it('filters today posts by generatedAt prefix correctly', async () => {
      vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
      const sameDayDiffTime = mockPost({ id: 'same-day', generatedAt: '2026-09-06T08:00:00.000Z' });
      const yesterday = mockPost({ id: 'yesterday', generatedAt: '2026-09-05T23:00:00.000Z' });
      mockReadJson.mockReturnValue([yesterday, sameDayDiffTime, { ...sameDayDiffTime, id: 'same-day-2' }]);

      await runAutoMarketing();

      expect(mockGenerateLlmBlogPost).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Already generated 2 posts'),
      );
    });
  });

  // ── CLI entry point ────────────────────────────────────────────────────────
  // Tested separately in auto-marketing-daemon-cli.test.ts because the CLI
  // entry point runs at module-eval time and requires a fresh module registry
  // (vi.resetModules disconnects hoisted mocks, making in-file CLI tests flaky).
});
