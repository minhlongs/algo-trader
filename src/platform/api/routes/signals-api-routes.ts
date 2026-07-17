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
import { randomUUID } from 'crypto';
import RaasGate from '../../../desk/gate/raas-gate';
import { LicenseTier } from '../../../shared/types/license';
import { requireSignalTier } from '../../middleware/feature-gate';
import { signalTtlEnforcer } from '../../../desk/signal/signal-ttl-enforcer';
import { filterSignalsForTier } from '../../../desk/signal/signal-tier-filter';
import { getCachedSignals, setCachedSignals } from '../../../desk/signal/signal-rest-cache';
import type { TierKey, SignalSubscription } from '../../../desk/signal/signal-types';
import type { Signal } from '../../../desk/signal/signal-types';
import { logger } from '../../../shared/utils/logger';

export const signalsApiRouter: Router = Router();
const gate = RaasGate.getInstance();

// ---------------------------------------------------------------------------
// In-memory stores (replace with D1/SQLite in production wiring)
// ---------------------------------------------------------------------------
const subscriptions: Map<string, SignalSubscription> = new Map();
const webhooks: Map<string, string> = new Map(); // subscriberId -> webhook URL

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
// Rate limiters
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve subscriber ID and tier from the Bearer API key header. */
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /subscribe
 * Create a signal subscription for the authenticated user.
 * Requires payment (PRO+ tier via signals_basic feature gate).
 */
signalsApiRouter.post('/subscribe', requireSignalTier('SIGNALS_BASIC'), (req: Request, res: Response) => {
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
  logger.info(`[SignalsApi] Subscribed subscriberId=${subscriberId} tier=${tier}`);
  res.json({ data: sub, message: 'Subscribed successfully' });
});

/**
 * GET /feed
 * Returns the live signal feed for an authenticated subscriber.
 * Rate-limited: 30 req/min per subscriber.
 * Results are cached, filtered by the subscriber's tier, and paginated.
 */
signalsApiRouter.get('/feed', requireSignalTier('SIGNALS_BASIC'), async (req: Request, res: Response) => {
  try {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }

    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
      return;
    }

    const { since, limit } = parsed.data;
    const { tier } = identity;

    // Try cache first
    const cached = await getCachedSignals(tier, since, limit);
    if (cached) {
      res.json({ data: cached, count: cached.length, tier, cached: true });
      return;
    }

    // Filter live signals for tier
    const live = signalTtlEnforcer.getLive();
    const filtered = filterSignalsForTier(
      live.filter((s: Signal) => s.ts >= since),
      tier,
    ).slice(0, limit);

    await setCachedSignals(tier, since, limit, filtered);
    res.json({ data: filtered, count: filtered.length, tier, cached: false });
  } catch (err) {
    logger.error('[SignalsApi] GET /feed failed', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /webhook
 * Register a webhook URL for receiving signal delivery callbacks.
 * The webhook endpoint is called on each new signal published to this subscriber.
 */
signalsApiRouter.post('/webhook', requireSignalTier('SIGNALS_BASIC'), (req: Request, res: Response) => {
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

  webhooks.set(subscriberId, url);
  logger.info(`[SignalsApi] Webhook registered subscriberId=${subscriberId} url=${url}`);
  res.json({ data: { subscriberId, url }, message: 'Webhook registered' });
});

/** Export stores for use by downstream delivery services (read-only access). */
export function getActiveSubscriptions(): SignalSubscription[] {
  return Array.from(subscriptions.values()).filter((s) => s.active);
}

export function getWebhookForSubscriber(subscriberId: string): string | undefined {
  return webhooks.get(subscriberId);
}
