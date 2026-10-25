/**
 * Usage Tracking Express Middleware (Platform v2)
 *
 * Records one metered call per request. The counter is incremented and
 * re-read in a single statement, so the number this writes is the number the
 * quota gate compares against — one row, one count.
 *
 * Records on 'finish' so the response is never delayed, but the increment is
 * awaited before the process moves on, and a failure is logged: a lost
 * increment is an under-billed call, which is the direction that cannot be
 * recovered later.
 *
 * Delegates to the canonical signals-focused UsageMeteringService so
 * that signal routes share one source of truth for billing metrics.
 *
 * Usage:
 *   app.use('/api/v1/signals', usageTrackingMiddleware());
 *   router.use(usageTrackingMiddleware());
 */

import type { Request, Response, NextFunction } from 'express';
import { usageMetering } from '../signals-api/usage-metering-service';
import { logger } from '@shared/utils/logger';

type SubscriberIdentity = { subscriberId: string; tier: string };

export function usageTrackingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.on('finish', () => {
    const identity = req.subscriber as SubscriberIdentity | undefined;
    if (!identity?.subscriberId || !identity?.tier) return;

    void (async () => {
      try {
        await usageMetering.recordCall(identity.subscriberId, identity.tier);
      } catch (err) {
        logger.error('[UsageMeter] recordCall failed; usage under-counted for this call', {
          subscriberId: identity.subscriberId,
          err,
        });
      }
    })();
  });

  next();
}
