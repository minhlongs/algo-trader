/**
 * Subscription service — D1-backed CRUD for user subscriptions.
 *
 * Endpoints:
 * GET /api/v1/subscriptions/me — current user's subscription
 * POST /api/v1/subscriptions/upgrade — upgrade/downgrade tier
 * DELETE /api/v1/subscriptions/cancel — cancel subscription
 * GET /api/v1/subscriptions/tiers — public tier list (no auth)
 *
 * Decomposed into modular submodules. Re-exports 100% public contracts.
 */

export type { Env, SubscriptionRow } from './subscriptions-types';
export {
  PRICING,
  getTierPrice,
  getTierDisplayName,
  resolveUserFromRequest,
  unauthorized,
  freeFallback,
  jsonHeaders,
} from './subscriptions-types';

export {
  handleGetMySubscription,
  handleUpgrade,
  handleCancel,
  handleGetTiers,
} from './subscriptions-handlers';
