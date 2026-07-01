/**
 * Blog API Routes (Express)
 * Serves auto-generated blog content for the landing page
 *
 * Endpoints:
 * - GET /api/blog/posts — list recent blog posts (JSON)
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { getBlogPosts } from '../../../desk/jobs/auto-marketing-daemon';

export const blogRouter: RouterType = Router();

blogRouter.get('/posts', (_req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(parseInt((_req.query.limit as string) || '10', 10) || 10, 50));
  const posts = getBlogPosts(limit);
  res.json(posts);
});
