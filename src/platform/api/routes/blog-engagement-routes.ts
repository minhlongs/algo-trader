/**
 * Blog Engagement Routes
 * Phase 34b Content Personalization — comments, recommendations, A/B testing.
 *
 * Endpoints:
 * - POST   /api/blog/posts/:postId/comments     — submit comment (LLM-moderated)
 * - GET    /api/blog/posts/:postId/comments     — list approved comments
 * - GET    /api/blog/posts/:postId/recommendations — similar posts
 * - POST   /api/blog/ab-test/impression         — record A/B test impression
 * - POST   /api/blog/ab-test/click              — record A/B test click
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { moderateComment, ModerationResult } from './comment-moderation-service';
import { findSimilarPosts, SimilarityInput } from '../../../shared/utils/post-similarity-engine';
import { getBlogPosts, BlogPost } from '../../../desk/jobs/auto-marketing-daemon';
import { getDbClient } from '../../../shared/db/postgres-client';

export const blogEngagementRouter: RouterType = Router();

/** Convert BlogPost to SimilarityInput for the engine */
function toSimilarityInput(p: BlogPost): SimilarityInput {
  return { id: p.id, title: p.title, tags: p.tags };
}

// ─── Comments ────────────────────────────────────────────────────

/** POST /posts/:postId/comments — Submit a comment with LLM moderation */
blogEngagementRouter.post('/posts/:postId/comments', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const { authorName, authorEmail, content } = req.body as {
      authorName?: string;
      authorEmail?: string;
      content?: string;
    };

    if (!content || typeof content !== 'string' || content.trim().length < 2) {
      return res.status(400).json({ error: 'Validation error', message: 'Comment content is required (min 2 chars)' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: 'Validation error', message: 'Comment too long (max 2000 chars)' });
    }

    const name = (authorName || 'Anonymous').trim().slice(0, 50);
    const email = authorEmail?.trim().slice(0, 100) || null;

    // Run moderation
    const moderation: ModerationResult = await moderateComment(content, name);
    const status = moderation.approved ? 'approved' : 'rejected';

    const db = getDbClient();
    const result = await db.query(
      `INSERT INTO blog_comments (post_id, author_name, author_email, content, status, moderation_reason, moderation_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [postId, name, email, content.trim(), status, moderation.reason || null, moderation.confidenceScore],
    );

    logger.info('[BlogEngagement] Comment submitted', {
      postId, status, confidence: moderation.confidenceScore,
    });

    return res.status(201).json({
      id: result.rows[0]?.id,
      status,
      moderationScore: moderation.confidenceScore,
      message: status === 'approved'
        ? 'Comment published'
        : `Comment held for moderation: ${moderation.reason || 'Content policy'}`,
    });
  } catch (error) {
    logger.error('[BlogEngagement] Error submitting comment', { error, postId: req.params.postId });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to submit comment' });
  }
});

/** GET /posts/:postId/comments — List approved comments for a post */
blogEngagementRouter.get('/posts/:postId/comments', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10) || 50, 1), 100);

    const db = getDbClient();
    const result = await db.query(
      `SELECT id, author_name, content, created_at
       FROM blog_comments
       WHERE post_id = $1 AND status = 'approved'
       ORDER BY created_at DESC
       LIMIT $2`,
      [postId, limit],
    );

    return res.json({
      data: result.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        authorName: r.author_name,
        content: r.content,
        createdAt: r.created_at,
      })),
      total: result.rows.length,
    });
  } catch (error) {
    logger.error('[BlogEngagement] Error listing comments', { error, postId: req.params.postId });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list comments' });
  }
});

// ─── Recommendations ─────────────────────────────────────────────

/** GET /posts/:postId/recommendations — Find similar posts */
blogEngagementRouter.get('/posts/:postId/recommendations', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const topN = Math.min(Math.max(parseInt((req.query.n as string) || '5', 10) || 5, 1), 10);
    const allPosts = getBlogPosts(100);

    const source = allPosts.find(p => p.id === postId);
    if (!source) {
      return res.status(404).json({ error: 'Not found', message: `Post ${postId} not found` });
    }

    const candidates = allPosts.map(toSimilarityInput);
    const sourceInput = toSimilarityInput(source);
    const recommendations = findSimilarPosts(sourceInput, candidates, topN);

    // Map back to post summaries
    const enriched = recommendations.map(r => {
      const post = allPosts.find(p => p.id === r.id);
      return {
        id: r.id,
        title: post?.title || '',
        excerpt: post?.excerpt || '',
        tags: post?.tags || [],
        date: post?.date || '',
        similarityScore: Math.round(r.score * 100) / 100,
        sharedTags: r.matchTags,
      };
    });

    return res.json({ data: enriched, sourcePostId: postId });
  } catch (error) {
    logger.error('[BlogEngagement] Error getting recommendations', { error, postId: req.params.postId });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get recommendations' });
  }
});

// ─── A/B Testing ─────────────────────────────────────────────────

/** POST /ab-test/impression — Record a variant impression */
blogEngagementRouter.post('/ab-test/impression', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const { testId, variant } = req.body as { testId?: string; variant?: string };

    if (!testId || !variant || !['A', 'B'].includes(variant)) {
      return res.status(400).json({ error: 'Validation error', message: 'testId and variant (A|B) required' });
    }

    const db = getDbClient();
    const column = variant === 'A' ? 'impressions_a' : 'impressions_b';
    await db.query(
      `UPDATE blog_ab_tests SET ${column} = ${column} + 1, updated_at = NOW() WHERE id = $1`,
      [testId],
    );

    res.status(204).end();
  } catch (error) {
    logger.error('[BlogEngagement] Error recording impression', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to record impression' });
  }
});

/** POST /ab-test/click — Record a variant click */
blogEngagementRouter.post('/ab-test/click', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const { testId, variant } = req.body as { testId?: string; variant?: string };

    if (!testId || !variant || !['A', 'B'].includes(variant)) {
      return res.status(400).json({ error: 'Validation error', message: 'testId and variant (A|B) required' });
    }

    const db = getDbClient();
    const column = variant === 'A' ? 'clicks_a' : 'clicks_b';
    await db.query(
      `UPDATE blog_ab_tests SET ${column} = ${column} + 1, updated_at = NOW() WHERE id = $1`,
      [testId],
    );

    res.status(204).end();
  } catch (error) {
    logger.error('[BlogEngagement] Error recording click', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to record click' });
  }
});
