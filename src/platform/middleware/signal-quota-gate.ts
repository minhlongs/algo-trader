/**
 * Signal Quota Gate
 *
 * The allowance decision runs BEFORE the response is produced, so a caller who
 * exhausted their period budget is refused instead of being served and charged.
 *
 * The blocking number and the billing number are the same row of `usage_metrics`:
 * the gate reads the current count, and the recorder increments and re-reads it
 * in one statement. Two clients polling the same subscriber cannot drift apart.
 *
 * Failure policy (founder decision): an unreadable counter must not be treated
 * as "no usage", or an exhausted subscriber would be served. On a durable read
 * error the gate answers 503 and logs an error so the outage is visible, rather
 * than silently letting traffic through.
 */

import type { Request, Response, NextFunction } from 'express';
import { usageMetering } from '../signals-api/usage-metering-service';
import { logger } from '@shared/utils/logger';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
  period: string;
}

declare module 'express' {
  interface Request {
    quota?: QuotaDecision;
  }
}

/** Ask the durable meter whether this call may proceed. */
export async function checkQuota(
  subscriberId: string,
  tier: string,
): Promise<QuotaDecision> {
  const result = await usageMetering.check(subscriberId, tier);
  return {
    allowed: result.allowed,
    used: result.used,
    limit: result.limit,
    period: result.period,
  };
}

/**
 * Express middleware. Callers without a resolved subscriber identity pass
 * through untouched — they are rejected upstream by the tier resolver, and a
 * metered endpoint must not become an authentication error of its own.
 */
export function enforceQuotaGate(req: Request, res: Response, next: NextFunction): void {
  const identity = req.subscriber as { subscriberId: string; tier: string } | undefined;
  if (!identity?.subscriberId || !identity?.tier) {
    next();
    return;
  }

  void (async () => {
    try {
      const decision = await checkQuota(identity.subscriberId, identity.tier);
      req.quota = decision;

      if (!decision.allowed) {
        res.status(429).json({
          error: 'Monthly quota exceeded',
          quota: decision,
          upgrade: 'https://cashclaw.cc/pricing',
        });
        return;
      }

      next();
    } catch (err) {
      // Fail closed: never serve metered traffic on an unreadable counter.
      logger.error('[QuotaGate] durable usage read failed; refusing request', {
        subscriberId: identity.subscriberId,
        err,
      });
      res.status(503).json({ error: 'Usage metering unavailable' });
    }
  })();
}
