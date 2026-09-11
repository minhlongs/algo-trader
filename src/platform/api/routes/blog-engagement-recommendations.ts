/**
 * Blog Engagement Recommendations Routes
 * Content recommendation engine integration for related blog posts.
 */
import type { Request, Response, Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { findSimilarPosts, SimilarityInput } from '../../../shared/utils/post-similarity-engine';
import { getBlogPosts, BlogPost } from '../../../desk/jobs/auto-marketing-daemon';

/** Convert BlogPost to SimilarityInput for the engine */
export function toSimilarityInput(p: BlogPost): SimilarityInput {
  return { id: p.id, title: p.title, tags: p.tags };
}

export function registerBlogRecommendationRoutes(router: RouterType): void {
  /** GET /posts/:postId/recommendations — Find similar posts */
  router.get('/posts/:postId/recommendations', requireTier('FREE'), async (req: Request, res: Response) => {
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
}
