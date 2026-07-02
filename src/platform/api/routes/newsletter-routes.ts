/**
 * Newsletter Routes — Email preference management + segmentation
 * Phase 34b Content Personalization — builds on existing SendGrid EmailService.
 *
 * Endpoints:
 * - POST   /api/newsletter/subscribe    — subscribe/update preferences
 * - DELETE  /api/newsletter/unsubscribe  — unsubscribe (email param)
 * - GET     /api/newsletter/preferences  — get preferences for email
 * - GET     /api/newsletter/segments     — list segments (admin)
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { } from '../../../platform/notifications/email-service';

export const newsletterRouter: RouterType = Router();

/** POST /subscribe — Subscribe or update preferences */
newsletterRouter.post('/subscribe', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const {
      email, tenantId, frequency, interests, topics,
    } = req.body as {
      email?: string;
      tenantId?: string;
      frequency?: string;
      interests?: string[];
      topics?: string;
    };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Validation error', message: 'Valid email is required' });
    }

    const validFrequencies = ['daily', 'weekly', 'monthly', 'none'];
    const validTopics = ['all', 'signals', 'strategies', 'performance', 'market-analysis'];

    const freq = frequency && validFrequencies.includes(frequency) ? frequency : 'weekly';
    const topic = topics && validTopics.includes(topics) ? topics : 'all';
    const tags = Array.isArray(interests) ? interests.map(String).slice(0, 20) : [];

    const db = getDbClient();
    await db.query(
      `INSERT INTO newsletter_preferences (email, tenant_id, frequency, interests, topics, subscribed, verified)
       VALUES ($1, $2, $3, $4, $5, true, false)
       ON CONFLICT (email)
       DO UPDATE SET frequency = $3, interests = $4, topics = $5, subscribed = true, updated_at = NOW()`,
      [email.trim().toLowerCase(), tenantId || null, freq, tags, topic],
    );

    logger.info('[Newsletter] Subscription updated', { email: email.slice(0, 8) + '***' });

    return res.status(200).json({
      message: 'Subscription updated',
      email,
      frequency: freq,
      topics: topic,
    });
  } catch (error) {
    logger.error('[Newsletter] Error subscribing', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to process subscription' });
  }
});

/** DELETE /unsubscribe — Remove from newsletter */
newsletterRouter.delete('/unsubscribe', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Validation error', message: 'Valid email query param required' });
    }

    const db = getDbClient();
    await db.query(
      `UPDATE newsletter_preferences SET subscribed = false, updated_at = NOW() WHERE email = $1`,
      [email],
    );

    return res.json({ message: 'Unsubscribed', email });
  } catch (error) {
    logger.error('[Newsletter] Error unsubscribing', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to unsubscribe' });
  }
});

/** GET /preferences — Get preferences for an email */
newsletterRouter.get('/preferences', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const email = (req.query.email as string || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Validation error', message: 'Valid email query param required' });
    }

    const db = getDbClient();
    const result = await db.query(
      `SELECT email, frequency, interests, topics, subscribed, verified, created_at
       FROM newsletter_preferences WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return res.json({ email, subscribed: false, message: 'Not subscribed' });
    }

    const r = result.rows[0] as Record<string, unknown>;
    return res.json({
      email: r.email,
      frequency: r.frequency,
      interests: r.interests,
      topics: r.topics,
      subscribed: r.subscribed,
      verified: r.verified,
      createdAt: r.created_at,
    });
  } catch (error) {
    logger.error('[Newsletter] Error getting preferences', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get preferences' });
  }
});

/** GET /segments — List all subscriber segments (admin/marketing use) */
newsletterRouter.get('/segments', requireTier('PRO'), async (_req: Request, res: Response) => {
  try {
    const db = getDbClient();
    const result = await db.query(
      `SELECT frequency, topics, COUNT(*) as subscriber_count
       FROM newsletter_preferences
       WHERE subscribed = true
       GROUP BY frequency, topics
       ORDER BY subscriber_count DESC`,
    );

    const byInterest = await db.query(
      `SELECT unnest(interests) as interest, COUNT(*) as count
       FROM newsletter_preferences
       WHERE subscribed = true AND interests IS NOT NULL AND array_length(interests, 1) > 0
       GROUP BY interest
       ORDER BY count DESC
       LIMIT 20`,
    );

    return res.json({
      segments: result.rows,
      topInterests: byInterest.rows,
      totalSubscribers: result.rows.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.subscriber_count), 0),
    });
  } catch (error) {
    logger.error('[Newsletter] Error listing segments', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list segments' });
  }
});
