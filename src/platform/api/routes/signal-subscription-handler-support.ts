/**
 * Shared helpers for the signal subscription route handlers.
 *
 * Split out of `signal-subscription-handlers.ts` so the route handlers stay under the
 * repository's 200-LOC ceiling. Every handler here shares exactly two concerns: resolving
 * the caller's identity from the request, and mapping a tenant-isolator denial onto a
 * response. Both live in one place so the ownership check and its error mapping cannot
 * drift apart between handlers.
 *
 * @module platform/api/routes/signal-subscription-handler-support
 */

import { Request, Response } from 'express';
import { resolveSubscriberId } from '../../middleware/signal-tier-resolver';
import { logger } from '../../../shared/utils/logger';

/**
 * Pull the caller's subscriber identity out of the request so tenant-scoped
 * handlers can verify ownership before touching any tenant's row. Returns null
 * when no bearer token is present at all.
 */
export function getCallerIdentity(req: Request): { subscriberId: string } | null {
  const identity = resolveSubscriberId(req);
  if (!identity) return null;
  return { subscriberId: identity.subscriberId };
}

/**
 * Map a tenant-isolator denial onto a response. The isolator throws with a
 * stable message prefix, so 403 is returned only for genuine access denials.
 */
export function denyUnlessAuthorized(err: unknown, res: Response, context: string): void {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message.includes('cross-tenant') || message.includes('no subscriber identity')) {
    res.status(403).json({ error: message });
    return;
  }
  logger.error(`[SignalSub] ${context} error`, { err });
  res.status(500).json({ error: `Failed to ${context}` });
}
