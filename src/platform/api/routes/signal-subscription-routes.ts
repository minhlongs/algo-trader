/**
 * Signal Subscription Routes — Platform v2 (D1 Backed)
 *
 * Endpoints:
 * GET /subscriptions/active — list all active subscriptions (admin/internal)
 * GET /subscriptions/:tenantId — get subscription for a specific tenant
 * POST /subscriptions — create or update subscription (requires SIGNALS_BASIC tier)
 * DELETE /subscriptions/:id — cancel subscription
 * GET /usage/:subscriberId — usage snapshot for a subscriber
 * GET /billing/stats — tier breakdown for dashboard
 *
 * Auth: Bearer API key via resolveSubscriberId (RaasGate).
 * Tier gating: requireSignalTier('SIGNALS_BASIC') on the POST route.
 * Persistence: D1 via signalSubscriberRepo (replaces old SignalSubscriptionServiceD1).
 */

import { Router } from 'express';
import { requireSignalTier } from '../../middleware/feature-gate';
import {
  handleListActiveSubscriptions,
  handleGetTenantSubscription,
  handleCreateSubscription,
  handleCancelSubscription,
  handleGetCurrentSubscription,
  handleGetUsageSnapshot,
} from './signal-subscription-handlers';
import {
  handleBillingPlans,
  handleBillingCheckout,
  handleBillingStats,
} from './signal-subscription-checkout-handlers';

export const signalSubscriptionRouter: Router = Router();

// ---------------------------------------------------------------------------
// Subscription Routes
// ---------------------------------------------------------------------------

signalSubscriptionRouter.get('/subscriptions/active', handleListActiveSubscriptions);
signalSubscriptionRouter.get('/subscriptions/:tenantId', handleGetTenantSubscription);

signalSubscriptionRouter.post(
  '/subscriptions',
  requireSignalTier('SIGNALS_BASIC'),
  handleCreateSubscription
);

signalSubscriptionRouter.post(
  '/subscriptions/subscribe',
  requireSignalTier('SIGNALS_BASIC'),
  handleCreateSubscription
);

signalSubscriptionRouter.delete('/subscriptions/:id/unsubscribe', handleCancelSubscription);
signalSubscriptionRouter.get('/subscription', handleGetCurrentSubscription);
signalSubscriptionRouter.delete('/subscriptions/:id', handleCancelSubscription);

// ---------------------------------------------------------------------------
// Usage & Billing Routes
// ---------------------------------------------------------------------------

signalSubscriptionRouter.get('/usage/:subscriberId', handleGetUsageSnapshot);
signalSubscriptionRouter.get('/billing/plans', handleBillingPlans);
signalSubscriptionRouter.post(
  '/billing/checkout',
  requireSignalTier('SIGNALS_BASIC'),
  handleBillingCheckout
);
signalSubscriptionRouter.get('/billing/stats', handleBillingStats);
