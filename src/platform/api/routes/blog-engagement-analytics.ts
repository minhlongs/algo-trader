/**
 * Blog Engagement Analytics Routes
 * Page views tracking, view statistics aggregation, and A/B test telemetry.
 */
import type { Request, Response, Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';

export function registerBlogAnalyticsRoutes(router: RouterType): void {
  // ─── Page View Analytics ────────────────────────────────────────

  /** POST /page-views — Record a blog post page view */
  router.post('/page-views', requireTier('FREE'), async (req: Request, res: Response) => {
    try {
      const { postId, viewerId, referrer, utm, viewDurationMs } = req.body as {
        postId?: string;
        viewerId?: string;
        referrer?: string;
        utm?: { source?: string; medium?: string; campaign?: string };
        viewDurationMs?: number;
      };

      if (!postId || typeof postId !== 'string' || postId.trim() === '') {
        return res.status(400).json({ error: 'Validation error', message: 'postId is required' });
      }

      const duration = Math.max(0, Math.min(Number(viewDurationMs) || 0, 24 * 60 * 60 * 1000)); // cap 24h

      const db = getDbClient();
      await db.query(
        `INSERT INTO blog_page_views (post_id, viewer_id, referrer, utm_source, utm_medium, utm_campaign, view_duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          postId.trim(),
          viewerId?.slice(0, 200) || null,
          referrer?.slice(0, 500) || null,
          utm?.source?.slice(0, 100) || null,
          utm?.medium?.slice(0, 100) || null,
          utm?.campaign?.slice(0, 100) || null,
          duration,
        ],
      );

      res.status(204).end();
    } catch (error) {
      logger.error('[BlogEngagement] Error recording page view', { error, postId: req.params.postId });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to record page view' });
    }
  });

  /** GET /page-views/stats — Aggregate page-view + time-on-page stats (admin/metrics token) */
  router.get('/page-views/stats', requireTier('PRO'), async (req: Request, res: Response) => {
    try {
      const days = Math.min(Math.max(parseInt((req.query.days as string) || '30', 10) || 30, 1), 90);
      const postId = (req.query.postId as string) || null;

      const db = getDbClient();
      const wherePost = postId ? 'AND post_id = $2' : '';
      const postParam = postId ? [days, postId] : [days];

      const result = await db.query(
        `SELECT post_id,
                COUNT(*) AS views,
                COUNT(DISTINCT viewer_id) AS unique_viewers,
                AVG(view_duration_ms) AS avg_duration_ms,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY view_duration_ms) AS median_duration_ms,
                MAX(viewed_at) AS last_viewed_at
         FROM blog_page_views
         WHERE viewed_at >= NOW() - ($1 || ' days')::interval ${wherePost}
         GROUP BY post_id
         ORDER BY views DESC
         LIMIT 100`,
        postParam,
      );

      return res.json({
        data: result.rows,
        windowDays: days,
        postId: postId || null,
      });
    } catch (error) {
      logger.error('[BlogEngagement] Error aggregating page views', { error });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to aggregate page views' });
    }
  });

  // ─── A/B Testing ─────────────────────────────────────────────────

  /** POST /ab-test/impression — Record a variant impression */
  router.post('/ab-test/impression', requireTier('FREE'), async (req: Request, res: Response) => {
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
  router.post('/ab-test/click', requireTier('FREE'), async (req: Request, res: Response) => {
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
}
