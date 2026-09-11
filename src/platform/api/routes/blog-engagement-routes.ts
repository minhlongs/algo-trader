/**
 * Blog Engagement Routes
 * Phase 34b Content Personalization — comments, recommendations, A/B testing.
 *
 * Endpoints:
 * - POST   /api/blog/posts/:postId/comments     — submit comment (LLM-moderated)
 * - GET    /api/blog/posts/:postId/comments     — list approved comments
 * - GET    /api/blog/posts/:postId/recommendations — similar posts
 * - POST   /api/blog/page-views                 — record page view
 * - GET    /api/blog/page-views/stats           — aggregate page view stats
 * - POST   /api/blog/ab-test/impression         — record A/B test impression
 * - POST   /api/blog/ab-test/click              — record A/B test click
 */
import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { registerBlogCommentRoutes } from './blog-engagement-comments';
import { registerBlogRecommendationRoutes, toSimilarityInput } from './blog-engagement-recommendations';
import { registerBlogAnalyticsRoutes } from './blog-engagement-analytics';

export const blogEngagementRouter: RouterType = Router();

registerBlogCommentRoutes(blogEngagementRouter);
registerBlogRecommendationRoutes(blogEngagementRouter);
registerBlogAnalyticsRoutes(blogEngagementRouter);

export { toSimilarityInput };
export { registerBlogCommentRoutes } from './blog-engagement-comments';
export { registerBlogRecommendationRoutes } from './blog-engagement-recommendations';
export { registerBlogAnalyticsRoutes } from './blog-engagement-analytics';
