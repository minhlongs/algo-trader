/**
 * Signal Feed API — tier-gated feed endpoints.
 *
 * Paginated signals + single signal lookup. Uses cache-first / Redis (signal-rest-cache)
 * with a TTL-enforced in-memory live fallback, kept tier-segmented.
 *
 * Mounted at /api/v1/signals in api/src/server.ts: AFTER the /subscriptions/:id route
 * so the /feed/:id route is not swallowed by the /subscriptions/:id regex.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { assertTenantAccess } from '@platform/raas/subscriber-tenant-isolator';
import { validateTenantId } from '@shared/tenant';
import { resolveSubscriberId } from '@platform/middleware/signal-tier-resolver';
import { requireSignalTier } from '@platform/middleware/feature-gate';
import { getCachedSignals, setCachedSignals } from '@desk/signal/signal-rest-cache';
import { signalTtlEnforcer } from '@desk/signal/signal-ttl-enforcer';
import { logger } from '@shared/utils/logger';

export const signalFeedRouter: ReturnType<typeof Router> = Router();

const feedQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /feed — paginated signals for the caller's tier.
 *
 * Cache-first: Redis (signal-rest-cache) keyed by tier+since+limit.
 * Fallback: TTL enforcer in-memory live segments filtered to the [since..now] window.
 *
 * Both paths are tier-segmented. Cache write failure is surfaced by a warning only
 * so callers still get the live signals via the 200 response.
 */
signalFeedRouter.get('/feed', requireSignalTier('SIGNALS_BASIC'), async (req: Request, res: Response) => {
  try {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }
    const tier = identity.tier;
    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
      return;
    }

    const { since, limit } = parsed.data;
    const cached = await getCachedSignals(tier, since, limit);
    if (cached) {
      res.json({ data: cached, count: cached.length, tier, cached: true });
      return;
    }

    const live = signalTtlEnforcer.getLive();
    const filtered = live.filter((s) => s.ts >= since).slice(0, limit);
    try {
      await setCachedSignals(tier, since, limit, filtered);
    } catch (cacheErr) {
      logger.warn('[SignalFeed] Redis write failed; continuing without cache', { cause: cacheErr });
    }
    res.json({ data: filtered, count: filtered.length, tier, cached: false });
  } catch (err) {
    logger.error('[SignalFeed] Feed list error', { err });
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

/**
 * GET /feed/:id — single signal lookup, TTL-gated.
 */
signalFeedRouter.get('/feed/:id', requireSignalTier('SIGNALS_BASIC'), (req: Request, res: Response) => {
  try {
    const identity = resolveSubscriberId(req);
    if (!identity) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }
    const { id } = req.params;
    const live = signalTtlEnforcer.getLive();
    const signal = live.find((s) => s.id === id);
    if (!signal) {
      res.status(404).json({ error: 'Signal not found or expired' });
      return;
    }
    res.json({ data: signal });
  } catch (err) {
    logger.error('[SignalFeed] Signal lookup error', { err });
    res.status(500).json({ error: 'Failed to fetch signal' });
  }
});
