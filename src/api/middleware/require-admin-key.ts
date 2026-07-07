import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';

export function requireAdminKey(req: Request, res: Response): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ error: 'Admin API not configured' });
    return false;
  }
  const provided = req.headers['x-admin-key'] as string | undefined;
  if (
    !provided ||
    provided.length !== adminKey.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(adminKey))
  ) {
    res.status(403).json({ error: 'Forbidden — invalid X-Admin-Key' });
    return false;
  }
  return true;
}
