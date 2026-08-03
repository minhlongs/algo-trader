/**
 * Signals API Routes — DEPRECATED REDIRECT SHIM
 *
 * All endpoints have moved to signal-subscription-routes.ts under /api/v1/signals.
 * This shim returns 410 Gone with a migration hint so existing clients update
 * without losing network visibility.
 *
 * Removed:
 * - POST /subscribe → POST /api/v1/signals/subscriptions
 * - GET  /feed     → GET  /api/v1/signals/feed
 * - POST /webhook  → POST /api/v1/signals/subscriptions (webhook URL via chatId)
 */

import { Router, Request, Response } from 'express';

export const signalsApiRouter: Router = Router();

signalsApiRouter.use((_req: Request, res: Response) => {
  res.status(410).json({
    error: 'Deprecated — use /api/v1/signals/subscriptions',
    migration: 'https://cashclaw.cc/docs/signals-api',
  });
});
