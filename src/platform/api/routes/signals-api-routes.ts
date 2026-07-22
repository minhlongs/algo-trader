/**
 * Signals API Routes
 *
 * POST /subscribe  — create signal subscription (requires payment via tier gate)
 * GET  /feed       — get signal feed for authenticated subscriber (rate-limited)
 * POST /webhook    — register webhook URL for signal delivery
 *
 * Tier gating: requireSignalTier('SIGNALS_BASIC') = PRO minimum.
 *
 * Auth: Bearer API key resolved via RaasGate; tier derived from license.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSignalTier } from '../../middleware/feature-gate';
import { resolveSubscriberId } from '../../middleware/signal-tier-resolver';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import type { TierKey } from '../../../desk/signal/signal-types';
import { logger } from '../../../shared/utils/logger';

export const signalsApiRouter: Router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const subscribeBodySchema = z.object({
  chatId: z.number().int().optional(),
});

const webhookBodySchema = z.object({
  url: z.string().url({ message: 'Invalid webhook URL' }),
});

const feedQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /subscribe
 * Create a signal subscription for the authenticated user.
 * Requires payment (PRO+ tier via signals_basic feature gate).
 */
signalsApiRouter.post('/subscribe', requireSignalTier('SIGNALS_BASIC'), async (req: Request, res: Response) => {
  try {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }

    const parsed = subscribeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
      return;
    }

    const { subscriberId, tier } = identity;
    const existing = await signalSubscriberRepo.getBySubscriberId(subscriberId);
    const now = Date.now();

    const sub = {
      id: existing?.id ?? `sub_${subscriberId}_${Date.now()}`,
      subscriberId,
      tier,
      active: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await signalSubscriberRepo.upsert(sub);
    if (parsed.data.chatId != null) {
      await signalSubscriberRepo.upsert({ ...sub, chatId: parsed.data.chatId });
    }

    res.json({ data: sub, message: 'Subscribed successfully' });
  } catch (err) {
    logger.error('[SignalsApi] Subscribe failed', { err });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * GET /feed
 * Returns the live signal feed for an authenticated subscriber.
 * Rate-limited: 30 req/min per subscriber.
 * Results are cached, filtered by the subscriber's tier, and paginated.
 */
signalsApiRouter.get('/feed', requireSignalTier('SIGNALS_BASIC'), async (req: Request, res: Response) => {
  res.status(410).json({ error: 'Use /api/v1/signals/feed from signal-feed-routes' });
});

/**
 * POST /webhook
 * Register a webhook URL for receiving signal delivery callbacks.
 * The webhook endpoint is called on each new signal published to this subscriber.
 */
signalsApiRouter.post('/webhook', requireSignalTier('SIGNALS_BASIC'), async (req: Request, res: Response) => {
  try {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }

    const parsed = webhookBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
      return;
    }

    const { subscriberId } = identity;
    const { url } = parsed.data;

    await signalSubscriberRepo.setWebhook(subscriberId, url);
    logger.info('[SignalsApi] Webhook registered', { subscriberId, url });
    res.json({ data: { subscriberId, url }, message: 'Webhook registered' });
  } catch (err) {
    logger.error('[SignalsApi] Webhook registration failed', { err });
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});
