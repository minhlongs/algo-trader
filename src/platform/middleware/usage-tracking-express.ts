/**
 * Usage Tracking Express Middleware (Platform v2)
 *
 * Uses res.on('finish') to fire recordCall() once the response is
 * complete — best-effort, never blocks the response path.
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

type SubscriberIdentity = { subscriberId: string; tier: string };

export function usageTrackingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Fire after response completes — non-fatal, no added latency
  res.on('finish', () => {
    try {
      const identity = req.subscriber as SubscriberIdentity | undefined;
      if (identity?.subscriberId && identity?.tier) {
        void usageMetering.recordCall(identity.subscriberId, identity.tier);
      }
    } catch {
      // usage tracking failure is never fatal
    }
  });

  next();
}
