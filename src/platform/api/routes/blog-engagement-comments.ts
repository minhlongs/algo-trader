/**
 * Blog Engagement Comments Routes
 * Moderated comments submission and retrieval for blog posts.
 */
import type { Request, Response, Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { moderateComment, ModerationResult } from './comment-moderation-service';
import { getDbClient } from '../../../shared/db/postgres-client';

export function registerBlogCommentRoutes(router: RouterType): void {
  /** POST /posts/:postId/comments — Submit a comment with LLM moderation */
  router.post('/posts/:postId/comments', requireTier('FREE'), async (req: Request, res: Response) => {
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
  router.get('/posts/:postId/comments', requireTier('FREE'), async (req: Request, res: Response) => {
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
}
