/**
 * Signal Subscription Routes — Platform v2 (D1 Backed)
 *
 * Endpoints:
 * GET /subscriptions/active — list all active subscriptions (admin/internal)
 * GET /subscriptions/:tenantId — get subscription for a specific tenant
 * POST /subscriptions — create or update subscription (requires SIGNALS_BASIC tier)
 * DELETE /subscriptions/:id — cancel subscription
 * GET /usage/:subscriberId — usage snapshot for a subscriber
 * GET /billing/stats — tier breakdown for dashboard
 *
 * Auth: Bearer API key via resolveSubscriberId (RaasGate).
 * Tier gating: requireSignalTier('SIGNALS_BASIC') on the POST route.
 * Persistence: D1 via signalSubscriberRepo (replaces old SignalSubscriptionServiceD1).
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import { usageMetering } from '../../signals-api/usage-metering-service';
import { resolveSubscriberId } from '../../middleware/signal-tier-resolver';
import { requireSignalTier } from '../../middleware/feature-gate';
import type { TierKey } from '../../../desk/signal/signal-types';
import { logger } from '../../../shared/utils/logger';

export const signalSubscriptionRouter: Router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const subscribeBodySchema = z.object({
  chatId: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /subscriptions/active — list all active subscriptions (admin/internal)
 */
signalSubscriptionRouter.get('/subscriptions/active', async (_req: Request, res: Response) => {
  try {
    const subs = await signalSubscriberRepo.getActiveSubscriptions();
    res.json({ data: subs });
  } catch (err) {
    logger.error('[SignalSub] List active error', { err });
    res.status(500).json({ error: 'Failed to list subscriptions' });
  }
});

/**
 * GET /subscriptions/:tenantId — get subscription for a specific tenant
 */
signalSubscriptionRouter.get('/subscriptions/:tenantId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const sub = await signalSubscriberRepo.getBySubscriberId(tenantId);
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }
    res.json({ data: sub });
  } catch (err) {
    logger.error('[SignalSub] Get by tenant error', { err });
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * Inline POST handler — shared logic for /subscriptions and /subscriptions/subscribe
 */
async function handleCreateSubscription(req: Request, res: Response) {
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
  try {
    const { subscriberId, tier } = identity;
    const existing = await signalSubscriberRepo.getBySubscriberId(subscriberId);
    const now = Date.now();
    const sub = {
      id: existing?.id ?? randomUUID(),
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
    logger.info('[SignalSub] Subscription created/updated', { subscriberId, tier });
    res.json({ data: sub, message: 'Subscription updated' });
  } catch (err) {
    logger.error('[SignalSub] Create/update error', { err });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
}

/**
 * POST /subscriptions — create or update subscription
 */
signalSubscriptionRouter.post(
  '/subscriptions',
  requireSignalTier('SIGNALS_BASIC'),
  handleCreateSubscription
);

/**
 * POST /subscriptions/subscribe — alias for POST /subscriptions
 */
signalSubscriptionRouter.post(
  '/subscriptions/subscribe',
  requireSignalTier('SIGNALS_BASIC'),
  handleCreateSubscription
);

/**
 * Inline DELETE handler — shared logic for /subscriptions/:id and /subscriptions/:id/unsubscribe
 */
async function handleCancelSubscription(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const existing = await signalSubscriberRepo.getActiveSubscriptions();
    const found = existing.some((s) => s.id === id);
    if (!found) {
      res.status(404).json({ error: 'Subscription not found or already cancelled' });
      return;
    }
    await signalSubscriberRepo.setActive(id, false);
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    logger.error('[SignalSub] Cancel error', { err });
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

/**
 * DELETE /subscriptions/:id/unsubscribe — alias for DELETE /subscriptions/:id
 */
signalSubscriptionRouter.delete('/subscriptions/:id/unsubscribe', handleCancelSubscription);

/**
 * GET /subscriptions/subscription — get current user subscription
 */
signalSubscriptionRouter.get('/subscription', async (req: Request, res: Response) => {
  const identity = resolveSubscriberId(req);
  if (!identity) {
    res.status(401).json({ error: 'Valid API key required' });
    return;
  }
  try {
    const sub = await signalSubscriberRepo.getBySubscriberId(identity.subscriberId);
    if (!sub) {
      res.status(404).json({ error: 'Not subscribed' });
      return;
    }
    res.json({ data: sub });
  } catch (err) {
    logger.error('[SignalSub] GET /subscription error', { err });
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

/**
 * DELETE /subscriptions/:id — cancel subscription
 */
signalSubscriptionRouter.delete('/subscriptions/:id', handleCancelSubscription);

/**
 * GET /usage/:subscriberId — usage snapshot for a subscriber
 *
 * Returns current period usage: callsThisPeriod, periodLimit, overage.
 * Source: UsageMeteringService (D1-persisted).
 */
signalSubscriptionRouter.get('/usage/:subscriberId', async (req: Request, res: Response) => {
  try {
    const subscriberId = req.params.subscriberId as string;
    if (!subscriberId || subscriberId.trim() === '') {
      res.status(400).json({ error: 'subscriberId required' });
      return;
    }

    const snapshot = await usageMetering.getSnapshot(subscriberId);
    if (!snapshot) {
      res.status(404).json({ error: 'No usage data for subscriber' });
      return;
    }

    res.json({
      subscriberId: snapshot.subscriberId,
      period: snapshot.period,
      callsThisPeriod: snapshot.callsThisPeriod,
      periodLimit: snapshot.periodLimit,
      overage: snapshot.overageCalls,
    });
  } catch (err) {
    logger.error('[SignalSub] Usage snapshot error', { err });
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

/**
 * GET /billing/stats — tier breakdown for dashboard
 *
 * Returns active subscription count per tier from D1.
 */
signalSubscriptionRouter.get('/billing/stats', async (_req: Request, res: Response) => {
  try {
    const subs = await signalSubscriberRepo.getActiveSubscriptions();
    // Group by tier — partial stats until metering layer provides real data
    const breakdown: Record<string, number> = {};
    for (const s of subs) {
      const t: TierKey = s.tier ?? 'FREE';
      breakdown[t] = (breakdown[t] ?? 0) + 1;
    }
    res.json({ data: breakdown });
  } catch (err) {
    logger.error('[SignalSub] Billing stats error', { err });
    res.status(500).json({ error: 'Failed to fetch billing stats' });
  }
});
