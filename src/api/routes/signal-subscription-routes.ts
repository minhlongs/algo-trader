/**
 * Signal Subscription Routes
 * POST /api/v1/signals/subscribe      — subscribe (set chatId, activate)
 * POST /api/v1/signals/unsubscribe    — deactivate subscription
 * GET  /api/v1/signals/subscription   — get current subscription status
 *
 * Auth: Better Auth session (cookie) OR Bearer API key.
 * Telegram commands (/subscribe, /unsubscribe) handled by bot command handler.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import RaasGate from '../../gate/raas-gate';
import { LicenseTier } from '../../types/license';
import type { SignalSubscription, TierKey } from '../../signal/signal-types';
import { logger } from '../../utils/logger';

export const signalSubscriptionRouter: Router = Router();
const gate = RaasGate.getInstance();

/** In-memory subscription store — replace with D1 query in production wiring */
const subscriptions: Map<string, SignalSubscription> = new Map();

const subscribeBodySchema = z.object({
  chatId: z.number().int().optional(),
});

/** Extract subscriberId from API key (simplified — maps licenseId → userId) */
function resolveSubscriberId(req: Request): { subscriberId: string; tier: TierKey } | null {
  const authHeader = req.headers.authorization ?? '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!apiKey) return null;

  const license = gate.validateApiKey(apiKey);
  if (!license) return null;

  let tier: TierKey = 'FREE';
  if (license.tier === LicenseTier.ENTERPRISE) tier = 'ENTERPRISE';
  else if (license.tier === LicenseTier.PRO) tier = 'PRO';

  const subscriberId = license.userId ?? license.id;
  return { subscriberId, tier };
}

/**
 * POST /api/v1/signals/subscribe
 * Body: { chatId?: number }
 */
signalSubscriptionRouter.post('/subscribe', (req: Request, res: Response) => {
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
  const existing = subscriptions.get(subscriberId);
  const now = Date.now();

  const sub: SignalSubscription = {
    id: existing?.id ?? randomUUID(),
    subscriberId,
    chatId: parsed.data.chatId ?? existing?.chatId,
    tier,
    active: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  subscriptions.set(subscriberId, sub);
  logger.info(`[SignalSub] Subscribed subscriberId=${subscriberId} tier=${tier}`);
  res.json({ data: sub, message: 'Subscribed successfully' });
});

/**
 * POST /api/v1/signals/unsubscribe
 */
signalSubscriptionRouter.post('/unsubscribe', (req: Request, res: Response) => {
  const identity = resolveSubscriberId(req);
  if (!identity) {
    res.status(401).json({ error: 'Valid API key required' });
    return;
  }

  const { subscriberId } = identity;
  const existing = subscriptions.get(subscriberId);

  if (!existing) {
    res.status(404).json({ error: 'No active subscription found' });
    return;
  }

  existing.active = false;
  existing.updatedAt = Date.now();
  logger.info(`[SignalSub] Unsubscribed subscriberId=${subscriberId}`);
  res.json({ message: 'Unsubscribed successfully' });
});

/**
 * GET /api/v1/signals/subscription
 */
signalSubscriptionRouter.get('/subscription', (req: Request, res: Response) => {
  const identity = resolveSubscriberId(req);
  if (!identity) {
    res.status(401).json({ error: 'Valid API key required' });
    return;
  }

  const sub = subscriptions.get(identity.subscriberId);
  if (!sub) {
    res.status(404).json({ error: 'No subscription found' });
    return;
  }

  res.json({ data: sub });
});

/** Export subscriptions map for use by signal publisher (read-only access) */
export function getActiveSubscriptions(): SignalSubscription[] {
  return Array.from(subscriptions.values()).filter((s) => s.active);
}
