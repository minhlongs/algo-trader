/**
 * Platform — RaaS Subscriber Context
 *
 * Multi-tenant, tier-gated, auth-protected. Every table query scoped to tenantId.
 * Serves REST + WebSocket API to paying subscribers.
 *
 * Architecture rule: platform/ MAY import from shared/ + desk/ (via shared interfaces).
 * platform/ MUST NOT be imported by desk/.
 *
 * Path alias: `@platform/*` → `src/platform/*`
 *
 * Key modules:
 *   api/           Express REST + WebSocket gateway, 31 route files with tier gating
 *   auth/          Better Auth integration (multi-tenant sessions)
 *   billing/       Invoice generation, NOWPayments, license management
 *   marketplace/   Multi-tenant strategy marketplace (listings, subscriptions, reviews)
 *   raas/          RaaS subscriber executor — sandbox per tenant with DLP + attestation
 *   metering/      Usage metering with threshold alerts
 *   middleware/     Tier gating (requireTier), rate limiting, Prometheus metrics
 *   audit/         AI decision audit, immutable trade audit
 *   referral/      Referral program management
 *   workers/       Cloudflare edge proxy worker
 *   telegram/      Telegram bot integration
 *   notifications/ Email service, dunning
 *   db/            Business services (PnL, trades, tenant credentials, tenant filter)
 *   dashboard/     Subscriber dashboard UI (Vite, separate build)
 *   landing/       Public landing page (cashclaw.cc)
 */

// API layer
export * from './api/index';

// RaaS executor
export * from './raas/index';

// Notifications
export * from './notifications/index';
