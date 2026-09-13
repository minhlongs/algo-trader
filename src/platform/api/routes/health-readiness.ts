import type { Router } from 'express';
import { Request, Response } from 'express';
import { getRedisClient } from '../../../redis';
import { getDbClient } from '../../../shared/db/postgres-client';

/**
 * GET /ready
 * Startup readiness probe — Kubernetes / load-balancer compatible.
 * Checks Redis + Postgres + encryption key presence only.
 */
export async function handleReadinessCheck(_req: Request, res: Response): Promise<Response> {
  try {
    const redis = getRedisClient();
    await redis.ping();

    const db = getDbClient();
    await db.query('SELECT 1');

    const encryptionKey = process.env['ENCRYPTION_KEY'];
    if (!encryptionKey) {
      return res.status(503).json({ ready: false, reason: 'missing_encryption_key' });
    }

    return res.json({ ready: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'readiness_check_failed';
    return res.status(503).json({ ready: false, reason });
  }
}
