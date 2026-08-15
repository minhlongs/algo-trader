/**
 * Marketplace Subscription Routes — Orchestrator
 *
 * Thin orchestrator that wires handler functions to Express routes.
 * All business logic lives in sub-modules for maintainability.
 *
 * Endpoints:
 * - POST   /                — Subscribe to a strategy listing
 * - GET    /                — List my subscriptions
 * - GET    /:id             — Get subscription details
 * - PATCH  /:id             — Update subscription (pause/resume/cancel)
 * - GET    /:id/performance — Subscriber-specific performance
 * - POST   /:id/execute     — Trigger execution for a subscription
 * - POST   /execute-strategy — Execute strategy for all subscribers
 */
import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { requireTier } from '../../middleware/feature-gate';

import {
  createSubscription,
  listSubscriptions,
  getSubscription,
} from './marketplace-subscription-crud-handlers';

import {
  updateSubscription,
  getSubscriptionPerformance,
} from './marketplace-subscription-mutation-handlers';

import {
  executeSubscription,
  executeStrategyForSubscribers,
} from './marketplace-subscription-execution-handlers';

// Re-export schemas for backward compatibility and testing
export {
  subscribeSchema,
  updateSubscriptionSchema,
  subscriptionFilterSchema,
  executeSchema,
  executeSingleSchema,
} from './marketplace-subscription-types';

// Re-export handler functions for testing
export {
  createSubscription,
  listSubscriptions,
  getSubscription,
} from './marketplace-subscription-crud-handlers';

export {
  updateSubscription,
  getSubscriptionPerformance,
} from './marketplace-subscription-mutation-handlers';

export {
  executeSubscription,
  executeStrategyForSubscribers,
} from './marketplace-subscription-execution-handlers';

// Create and configure the router
export const marketplaceSubscriptionRouter: RouterType = Router();

// Subscription CRUD — all tiers can subscribe/read; mutations gated at handler level
marketplaceSubscriptionRouter.post(
  '/',
  requireTier('FREE'),
  createSubscription,
);
marketplaceSubscriptionRouter.get(
  '/',
  requireTier('FREE'),
  listSubscriptions,
);
marketplaceSubscriptionRouter.get(
  '/:id',
  requireTier('FREE'),
  getSubscription,
);
marketplaceSubscriptionRouter.patch(
  '/:id',
  requireTier('FREE'),
  updateSubscription,
);
marketplaceSubscriptionRouter.get(
  '/:id/performance',
  requireTier('FREE'),
  getSubscriptionPerformance,
);

// Execution endpoints
marketplaceSubscriptionRouter.post(
  '/:id/execute',
  requireTier('FREE'),
  executeSubscription,
);
marketplaceSubscriptionRouter.post(
  '/execute-strategy',
  requireTier('ENTERPRISE'),
  executeStrategyForSubscribers,
);

export default marketplaceSubscriptionRouter;
