/**
 * Admin Qwen Auth Middleware — Express-compatible admin API authentication.
 * Checks X-Admin-Key header against ADMIN_API_KEY environment variable.
 */

import type { Request, Response, Router } from 'express';

/** Simple Express-compatible admin auth — checks X-Admin-Key header for Router handlers */
export function requireAdminKey(req: Request, res: Response): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ error: 'Admin API not configured' });
    return false;
  }
  const provided = req.headers['x-admin-key'] as string | undefined;
  if (!provided || provided !== adminKey) {
    res.status(403).json({ error: 'Forbidden — invalid X-Admin-Key' });
    return false;
  }
  return true;
}
