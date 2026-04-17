/**
 * Signal Feed Routes
 * GET /api/v1/signals          — paginated REST (auth + tier-gated)
 * GET /api/v1/signals/:id      — single signal lookup
 * GET /api/v1/signals/stream   — SSE stream (ENTERPRISE only)
 *
 * Auth: Bearer API key resolved via RaasGate; tier derived from license.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import RaasGate from '../../gate/raas-gate';
import { LicenseTier } from '../../types/license';
import { filterSignalsForTier, canAccessSse } from '../../signal/signal-tier-filter';
import { signalTtlEnforcer } from '../../signal/signal-ttl-enforcer';
import { getCachedSignals, setCachedSignals } from '../../signal/signal-rest-cache';
import { sseBroadcaster } from '../../signal/sse-signal-broadcaster';
import type { TierKey } from '../../signal/signal-types';
import { logger } from '../../utils/logger';

export const signalFeedRouter: Router = Router();
const gate = RaasGate.getInstance();

const listQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Resolve tier from Bearer API key header */
function resolveTier(req: Request): TierKey {
  const authHeader = req.headers.authorization ?? '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!apiKey) return 'FREE';

  const license = gate.validateApiKey(apiKey);
  if (!license) return 'FREE';

  switch (license.tier) {
    case LicenseTier.ENTERPRISE: return 'ENTERPRISE';
    case LicenseTier.PRO: return 'PRO';
    default: return 'FREE';
  }
}

/**
 * GET /api/v1/signals/stream
 * SSE stream — ENTERPRISE tier only. Must be registered before /:id to avoid conflict.
 */
signalFeedRouter.get('/stream', (req: Request, res: Response) => {
  const tier = resolveTier(req);

  if (!canAccessSse(tier)) {
    res.status(403).json({
      error: 'SSE stream requires ENTERPRISE tier',
      upgrade: 'https://cashclaw.cc/pricing',
    });
    return;
  }

  logger.info(`[SignalFeed] SSE connection opened tier=${tier}`);
  sseBroadcaster.subscribe(res);
  // subscribe sets up res.on('close') cleanup internally
});

/**
 * GET /api/v1/signals?since=<ts>&limit=<n>
 * Returns filtered + paginated signals for the caller's tier.
 */
signalFeedRouter.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' });
      return;
    }

    const { since, limit } = parsed.data;
    const tier = resolveTier(req);

    // Try cache first
    const cached = await getCachedSignals(tier, since, limit);
    if (cached) {
      res.json({ data: cached, count: cached.length, tier, cached: true });
      return;
    }

    // Filter live signals for tier
    const live = signalTtlEnforcer.getLive();
    const filtered = filterSignalsForTier(
      live.filter((s) => s.ts >= since),
      tier
    ).slice(0, limit);

    await setCachedSignals(tier, since, limit, filtered);
    res.json({ data: filtered, count: filtered.length, tier, cached: false });
  } catch (err) {
    logger.error('[SignalFeed] GET / failed', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/v1/signals/:id
 * Returns a single signal if not expired and visible to caller's tier.
 */
signalFeedRouter.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const tier = resolveTier(req);

  const live = signalTtlEnforcer.getLive();
  const signal = live.find((s) => s.id === id);

  if (!signal) {
    res.status(404).json({ error: 'Signal not found or expired' });
    return;
  }

  // Tier filter: must pass confidence threshold
  const visible = filterSignalsForTier([signal], tier);
  if (visible.length === 0) {
    res.status(403).json({ error: 'Signal not available for your tier' });
    return;
  }

  res.json({ data: signal });
});
