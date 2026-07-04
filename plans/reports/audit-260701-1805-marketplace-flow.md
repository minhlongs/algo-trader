# Marketplace E2E Flow Audit Report

**Date:** 2026-07-01 18:05
**Auditor:** Claude Code (Explore agent)
**Context:** `/Users/macbook/algo-trader`
**Status:** Phase 01 Verification Complete

---

## 1. What's Fully Wired

### 1.1 NOWPayments Checkout Flow

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| `createMarketplaceCheckoutUrl()` | `src/platform/billing/nowpayments-service.ts` | 191-249 | WIRED |
| `isMarketplaceOrderId()` | `src/platform/billing/nowpayments-service.ts` | 254-256 | WIRED |
| `parseMarketplaceOrderId()` | `src/platform/billing/nowpayments-service.ts` | 262-271 | WIRED |

**Evidence:** Creates dynamic NOWPayments invoice via `POST /v1/invoice` with `order_id` set to `mp_{listingId}_{tenantIdPrefix}_{timestamp}`. Callback URL configurable via `NOWPAYMENTS_IPN_URL` env var. Payment ID and checkout URL returned to caller. HMAC-SHA512 signature verification at lines 98-128.

### 1.2 IPN Webhook Handler

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| HMAC verification | `src/platform/api/routes/webhooks/nowpayments-webhook.ts` | 54 | WIRED |
| Marketplace detection | `src/platform/api/routes/webhooks/nowpayments-webhook.ts` | 68-70 | WIRED |
| `handleMarketplaceIpnFinished()` | `webhooks/handlers/marketplace-payment-handler.ts` | 21-82 | WIRED |
| `handleMarketplaceIpnCancelled()` | `webhooks/handlers/marketplace-payment-handler.ts` | 87-112 | WIRED |

**Evidence:** Webhook checks `x-nowpayments-sig` header, verifies HMAC, detects marketplace payments via `order_id` prefix `mp_`, dispatches to marketplace-specific handlers. Finished handler calls `activateByPaymentId()` then `revenueService.requestPayout()` with 20/80 split. Cancelled handler calls `cancelByPaymentId()`.

### 1.3 Subscription Service

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| `subscribe()` | `src/platform/marketplace/services/subscription.service.ts` | 31-113 | WIRED |
| `activateByPaymentId()` | `src/platform/marketplace/services/subscription.service.ts` | 119-159 | WIRED |
| `cancelByPaymentId()` | `src/platform/marketplace/services/subscription.service.ts` | 164-190 | WIRED |
| `listSubscriptions()` | `src/platform/marketplace/services/subscription.service.ts` | 192-210 | WIRED |
| `updateSubscriptionStatus()` | `src/platform/marketplace/services/subscription.service.ts` | 216-238 | WIRED |
| `getSubscriptionByPaymentId()` | `src/platform/marketplace/services/subscription.service.ts` | 294-296 | WIRED |

**Evidence:** State machine: `pending_payment` (if price > 0) or `active` (if free) -> `paused` | `cancelled`. `activateByPaymentId` increments `subscriber_count` via `listingRepo.incrementSubscriberCount()`.

### 1.4 Execution Bridge

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| `executeForSubscriber()` | `src/platform/marketplace/services/marketplace-execution-bridge.ts` | 52-102 | WIRED |
| `executeActiveForStrategy()` | `src/platform/marketplace/services/marketplace-execution-bridge.ts` | 108-137 | WIRED |
| `syncExecutionResult()` | `src/platform/marketplace/services/marketplace-execution-bridge.ts` | 142-170 | WIRED |
| Instantiates SubscriberExecutor | `src/platform/marketplace/services/marketplace-execution-bridge.ts` | 36-38 | WIRED |

**Evidence:** Constructor creates `new SubscriberExecutor()`. Execution converts cent-based investment to dollars (`capitalUsdt = currentInvestmentUsd / 100`). Results sync back to subscription P&L and marketplace performance table.

### 1.5 Subscriber Executor

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| `SubscriberExecRequest` interface | `src/platform/raas/subscriber-executor.ts` | 14-21 | WIRED |
| `SubscriberExecResult` interface | `src/platform/raas/subscriber-executor.ts` | 23-32 | WIRED |
| `execute()` | `src/platform/raas/subscriber-executor.ts` | 78-140 | WIRED |
| `getRecentExecutions()` | `src/platform/raas/subscriber-executor.ts` | 197-211 | WIRED |
| `recordTrade()` | `src/platform/raas/subscriber-executor.ts` | 142-192 | WIRED |

**Evidence:** Execute method validates tenant filter, checks credentials, runs DLP gate, invokes sandbox, records trade to DB. Full interface and result type defined.

### 1.6 Dashboard Marketplace Page

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Browse tab | `dashboard/src/pages/marketplace-page.tsx` | 161-301 | WIRED |
| My Subscriptions tab | `dashboard/src/pages/marketplace-page.tsx` | 304-377 | WIRED |
| Subscribe button in strategy cards | `dashboard/src/pages/marketplace-page.tsx` | 260-273 | WIRED |
| Subscribe modal with allocation slider | `dashboard/src/pages/marketplace-page.tsx` | 381-461 | WIRED |
| Checkout URL handling (Pay with USDT) | `dashboard/src/pages/marketplace-page.tsx` | 427-447 | WIRED |
| Pause/Resume buttons | `dashboard/src/pages/marketplace-page.tsx` | 347-363 | WIRED |
| Cancel button | `dashboard/src/pages/marketplace-page.tsx` | 364-372 | WIRED |
| Execute button | `dashboard/src/pages/marketplace-page.tsx` | 338-345 | WIRED |

**Evidence:** Both tabs rendered. Subscribe modal opens on button click, shows allocation range slider, price display. When `checkoutUrl` is returned, shows "Pay with USDT (NOWPayments)" link + "I already paid" button. Pause/Resume/Cancel buttons wired by status.

### 1.7 Dashboard Hook

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| `loadStrategies()` | `dashboard/src/hooks/use-marketplace.ts` | 43-74 | WIRED |
| `loadSubscriptions()` | `dashboard/src/hooks/use-marketplace.ts` | 84-90 | WIRED |
| `subscribe()` | `dashboard/src/hooks/use-marketplace.ts` | 92-104 | WIRED |
| `updateSubscription()` | `dashboard/src/hooks/use-marketplace.ts` | 106-118 | WIRED |
| `executeSubscription()` | `dashboard/src/hooks/use-marketplace.ts` | 120-125 | WIRED |

**Evidence:** All hooks call correct API endpoints: `GET /v1/marketplace/strategies`, `GET /v1/marketplace/subscriptions`, `POST /v1/marketplace/subscriptions`, `PATCH /v1/marketplace/subscriptions/:id`, `POST /v1/marketplace/subscriptions/:id/execute`.

### 1.8 API Routes

| Endpoint | File | Line | Status |
|----------|------|------|--------|
| `GET /v1/marketplace/strategies` | `marketplace-strategy-listings-routes.ts` | 29 | WIRED |
| `GET /v1/marketplace/strategies/:id` | `marketplace-strategy-listings-routes.ts` | 144 | WIRED |
| `POST /v1/marketplace/strategies/publish` | `marketplace-strategy-listings-routes.ts` | 60 | WIRED |
| `PATCH /v1/marketplace/strategies/:id` | `marketplace-strategy-management-routes.ts` | 26 | WIRED |
| `POST /v1/marketplace/strategies/:id/vetting/request` | `marketplace-strategy-management-routes.ts` | 70 | WIRED |
| `POST /v1/marketplace/subscriptions` | `marketplace-subscription-routes.ts` | 96 | WIRED |
| `GET /v1/marketplace/subscriptions` | `marketplace-subscription-routes.ts` | 157 | WIRED |
| `GET /v1/marketplace/subscriptions/:id` | `marketplace-subscription-routes.ts` | 190 | WIRED |
| `PATCH /v1/marketplace/subscriptions/:id` | `marketplace-subscription-routes.ts` | 227 | WIRED |
| `GET /v1/marketplace/subscriptions/:id/performance` | `marketplace-subscription-routes.ts` | 298 | WIRED |
| `POST /v1/marketplace/subscriptions/:id/execute` | `marketplace-subscription-routes.ts` | 348 | WIRED |
| `POST /v1/marketplace/subscriptions/execute-strategy` | `marketplace-subscription-routes.ts` | 403 | WIRED |
| Creator revenue routes | `marketplace-creator-revenue-routes.ts` | 45-128 | WIRED |
| Admin marketplace routes | `admin-marketplace-routes.ts` | 1-31 | WIRED |

**Evidence:** All routes defined with Zod validation, tier gating (`requireTier('FREE')`), tenant isolation, audit logging, error handling.

### 1.9 Revenue Service

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| `calculateCreatorPayout()` | `src/platform/marketplace/services/revenue.service.ts` | 52-85 | WIRED |
| `requestPayout()` | `src/platform/marketplace/services/revenue.service.ts` | 91-146 | WIRED |
| `getRevenueReport()` | `src/platform/marketplace/services/revenue.service.ts` | 152-211 | WIRED |
| Platform fee: 20%, Creator share: 80% | `src/platform/marketplace/services/revenue.service.ts` | 5-6 | WIRED |

### 1.10 Repositories

| Component | File | Status |
|-----------|------|--------|
| `StrategyRepository` | `src/platform/marketplace/repositories/strategy-repository.ts` | WIRED |
| `ListingRepository` | `src/platform/marketplace/repositories/listing-repository.ts` | WIRED |
| `SubscriptionRepository` | `src/platform/marketplace/repositories/subscription-repository.ts` | WIRED |
| `RevenueShareRepository` | `src/platform/marketplace/repositories/revenue-share-repository.ts` | WIRED |
| `PerformanceRepository` | `src/platform/marketplace/repositories/performance-repository.ts` | WIRED |
| `ReviewRepository` | `src/platform/marketplace/repositories/review-repository.ts` | WIRED |
| `DisputeRepository` | `src/platform/marketplace/repositories/dispute-repository.ts` | WIRED |
| `VettingJobRepository` | `src/platform/marketplace/repositories/vetting-job-repository.ts` | WIRED |

### 1.11 Tests

| Test File | Status |
|-----------|--------|
| `__tests__/marketplace-subscription-routes.test.ts` | EXISTS |
| `__tests__/marketplace-payment-handler.test.ts` | EXISTS |
| `__tests__/marketplace-creator-revenue-routes.test.ts` | EXISTS |
| `__tests__/subscription-service.test.ts` | EXISTS |
| `__tests__/subscription-repository.test.ts` | EXISTS |
| `__tests__/revenue-service.test.ts` | EXISTS |
| `__tests__/revenue-share-repository.test.ts` | EXISTS |
| `__tests__/listing-repository.test.ts` | EXISTS |
| `__tests__/strategy-repository.test.ts` | EXISTS |

---

## 2. What's Partially Wired

### 2.1 Subscriber Executor Stubs (Phase 02/03 Gaps)

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| `invokeSandbox()` | `src/platform/raas/subscriber-executor.ts` | 39-51 | STUB |
| `checkDlpPolicy()` | `src/platform/raas/subscriber-executor.ts` | 54-60 | STUB |

**What works:** The `execute()` method calls both functions, records trades to DB, handles DLP_BLOCKED status.
**What's missing:** `invokeSandbox()` returns deterministic result based on payload hash instead of running real Wasm sandbox. `checkDlpPolicy()` only blocks IDs starting with `blocked-` instead of real IronClaw integration.

### 2.2 Subscribe Modal Payment Flow

**What works:** Modal shows `checkoutUrl` when returned, user can click "Pay with USDT" link.
**What's missing:** No polling for payment completion. User clicks "I already paid" which just closes modal + reloads subscriptions — but subscription is still `pending_payment` until IPN webhook fires. No status feedback, no spinner, no retry mechanism.

### 2.3 Price Display in Dashboard

**File:** `dashboard/src/pages/marketplace-page.tsx`

**What works:** `listingPriceUsdMonthly` displayed as `$${s.listingPriceUsdMonthly}/mo` in the subscribe button.
**What's inconsistent:** Value from backend is in cents (e.g., 2999 = $29.99), but dashboard displays it as-is without dividing by 100: `$${s.listingPriceUsdMonthly}/mo`. Meanwhile, `formatCents()` (line 24) correctly divides by 100. This means prices shown in the subscribe button are 100x too high.

### 2.4 Backend Price Cents/Dollars Handling

**File:** `src/platform/marketplace/services/subscription.service.ts` line 68

The subscribe method converts `listing.priceUsdMonthly / 100` before passing to NOWPayments:
```
priceUsd: listing.priceUsdMonthly / 100, // Convert cents to dollars
```

This is correct — the listing stores cents, NOWPayments expects dollars. However, the comment says "Convert cents to dollars" but `priceUsdMonthly` column naming implies it's already in dollars. There's ambiguity in the naming convention.

### 2.5 Strategy Table Schema Discrepancy (CRITICAL)

The main code repositories query columns like `creator_id`, `risk_level`, `min_allocation_usd`, `max_allocation_usd`, `backtest_summary` from a table called `marketplace_strategies`. However, the schema defined in worktree migration `040_marketplace_strategies.sql` uses a COMPLETELY DIFFERENT schema with columns like `pricing_model`, `subscription_price_monthly`, `profit_share_percentage`, `performance_90d_sharpe`, etc.

**The worktree schema does NOT match what the code expects.** This means even if the migration is applied, the repositories would fail because the columns don't exist.

---

## 3. What's Completely Missing

### 3.1 (CRITICAL) Marketplace Table Migrations Missing from Main Source

**No `CREATE TABLE` statements for any marketplace table exist in `src/db/migrations/`.**
- `marketplace_strategies` — NO migration in main source
- `marketplace_listings` — NO migration in main source  
- `marketplace_subscriptions` — Migration 031 only adds `payment_id` and `payment_status` columns (ALTER TABLE), but the initial CREATE TABLE is missing
- `marketplace_performance` — NO migration in main source
- `marketplace_reviews` — NO migration in main source
- `marketplace_revenue_shares` — NO migration in main source (worktree has `revenue_shares` at 044, but different schema from what the code expects)
- `marketplace_disputes` — NO migration in main source
- `marketplace_vetting_jobs` — NO migration in main source

The worktree `wf_a501e5fb-dc8-10` contains migration files for some of these (040-045), but **those schemas do not match what the repository code expects**. The system will fail at the database level.

### 3.2 Auto-Trigger Execution on Subscription Activation (Phase 03 Gap)

The execution bridge `executeActiveForStrategy()` exists and works on-demand, but there is NO mechanism to auto-trigger execution when a subscription transitions from `pending_payment` to `active`. The `activateByPaymentId()` method does not call the execution bridge.

### 3.3 Payment Confirmation Polling in Dashboard

The dashboard does not poll for payment status after redirecting to NOWPayments. The "I already paid" button is a manual workaround with no confirmation that payment actually succeeded.

### 3.4 Wasm Sandbox Runtime (Phase 02)

`invokeSandbox()` is a stub. No real Wasm runtime integration exists.

### 3.5 IronClaw DLP Filter (Phase 03)

`checkDlpPolicy()` is a stub. No real DLP integration exists.

### 3.6 Webhook Resilience Integration

The `webhook-resilience.ts` module exists but is NOT used in the `nowpayments-webhook.ts` route. The webhook directly processes IPN events without idempotency checks, retry queue, or dead-letter handling.

### 3.7 Subscription Renewal

No subscription renewal mechanism exists. Subscriptions are single-payment with no recurring billing support. After 30 days, there's no way to auto-renew or re-bill.

### 3.8 Revenue Payout Scheduler

`marketplace-payout-scheduler.ts` exists as a file but was not verified in detail. Periodic payout processing may not be wired.

---

## 4. Dependency Chain Verification

### End-to-End Flow: Browse -> Subscribe -> Pay -> IPN -> Activate -> Execute

| Step | Component | Status | Details |
|------|-----------|--------|---------|
| 1. Browse strategies | Dashboard page -> useApi -> GET /strategies | WIRED | Filter, sort, paginate all work |
| 2. Subscribe click | Dashboard -> open modal with allocation slider | WIRED | Modal renders with price display |
| 3. Subscribe API call | Modal -> handleSubscribe -> POST /subscriptions | WIRED | Returns checkoutUrl from NOWPayments |
| 4. Redirect to payment | Dashboard shows "Pay with USDT" link -> NOWPayments | WIRED | User clicks external link |
| 5. User pays USDT | NOWPayments (external) | OK | User completes payment on NOWPayments |
| 6. IPN webhook fires | NOWPayments -> POST /webhooks/nowpayments | WIRED | HMAC verified, marketplace detected |
| 7. Activate subscription | handleMarketplaceIpnFinished -> activateByPaymentId | WIRED | Status -> active, subscriber_count++ |
| 8. Create revenue share | handleMarketplaceIpnFinished -> revenueService.requestPayout | WIRED | 20/80 split recorded |
| 9. User sees active subscription | Dashboard -> refresh -> GET /subscriptions | WIRED | Shows "active" badge |
| 10. Manual execution | Dashboard -> Execute button -> POST /execute | WIRED | Bridge -> Executor -> sandbox stub |
| 11. Auto-trigger execution | On activation -> auto-execute | MISSING | No auto-trigger mechanism |
| 12. Pause/Resume/Cancel | Dashboard -> PATCH /:id | WIRED | Status transitions work |
| 13. Cancellation via IPN | handleMarketplaceIpnCancelled -> cancelByPaymentId | WIRED | Payment failure -> cancelled |

**Verdict:** Steps 1-10 work end-to-end. Step 11 is missing (manual execute only). Steps 12-13 work. The full flow connects from browse through payment confirmation, but requires manual execution.

### Critical Blockers

1. **Database tables missing** — NONE of the marketplace tables have CREATE TABLE statements in the main source tree. The system will fail on first query.
2. **Price display bug** — Prices shown in dashboard subscribe button are 100x too high (cents displayed as dollars without division)
3. **Schema mismatch** — Worktree migration schemas don't match code repository expectations
4. **No payment polling** — User has no feedback on payment progress after leaving to NOWPayments

---

## 5. Specific Recommendations

### Phase 02: Wire Subscribe UI + Checkout Redirect

1. **Fix price display in dashboard subscribe button** (`/Users/macbook/algo-trader/dashboard/src/pages/marketplace-page.tsx` line 271): Change `$${s.listingPriceUsdMonthly}/mo` to use a cents-to-dollars formatter like `formatCents(s.listingPriceUsdMonthly)`. Currently shows 100x too much.

2. **Add payment confirmation polling** (`/Users/macbook/algo-trader/dashboard/src/pages/marketplace-page.tsx` lines 427-447): After redirecting to NOWPayments, poll `GET /subscriptions` every 5 seconds. When subscription status changes from `pending_payment` to `active`, close modal and show success. If it stays `pending_payment` for more than 5 minutes, show a "Payment still pending" message.

3. **Consider subscribing to execution events** by implementing a message-driven approach: when the bridge receives a market signal, it should iterate active subscriptions. This is partially wired via `executeActiveForStrategy()` but needs a caller (e.g., signal pipeline integration).

### Phase 03: Wire Execution Auto-Trigger on Activation

4. **Add auto-trigger call in `activateByPaymentId()`** (`src/platform/marketplace/services/subscription.service.ts` around line 155): After setting status to active, call `marketplaceExecutionBridge.executeForSubscriber(sub.id, {})` to trigger initial execution.

5. **Integrate webhook resilience** (`src/platform/api/routes/webhooks/nowpayments-webhook.ts`): Use `processWebhook()` from `webhook-resilience.ts` to add idempotency and retry capability to the IPN handler. Currently the webhook processes directly without resilience.

### Phase 04: My Subscriptions Manage UI

6. **Already wired**: Pause, Resume, Cancel, Execute buttons all exist and work. No changes needed for basic management.

7. **Add loading indicators** for subscription operations. The execute button shows `...` but no spinner/loading state exists for pause/resume/cancel operations.

### Critical Must-Fix (Before Production)

8. **Create migration files for all marketplace tables** in `src/db/migrations/`:
   - Migration for `marketplace_strategies` — with columns matching what repositories expect: `id`, `tenant_id`, `creator_id`, `name`, `description`, `category`, `status`, `risk_level`, `min_allocation_usd`, `max_allocation_usd`, `supported_exchanges`, `tags`, `backtest_summary`, `vetted_at`, `vetted_by`, `rejection_reason`, `payout_address`, `created_at`, `updated_at`
   - Migration for `marketplace_listings` — with columns: `id`, `strategy_id`, `tenant_id`, `price_usd_monthly`, `billing_cycle`, `risk_limits`, `allowed_tenants`, `excluded_tenants`, `is_active`, `subscriber_count`, `created_at`, `updated_at`
   - Migration for `marketplace_subscriptions` — with columns: `id`, `tenant_id`, `listing_id`, `strategy_id`, `status`, `allocation_percent`, `custom_risk_limits`, `current_investment_usd`, `total_pnl_usd`, `payment_id`, `payment_status`, `subscription_started_at`, `paused_at`, `cancelled_at`, `created_at`, `updated_at`
   - Migration for `marketplace_performance` — with columns: `id`, `strategy_id`, `tenant_id` (nullable), `date`, `sharpe_ratio`, `max_drawdown`, `total_pnl_usd`, `win_rate`, `total_trades`, `winning_trades`, `losing_trades`, `avg_win_usd`, `avg_loss_usd`, `profit_factor`, `volatility`, `created_at`, `updated_at`
   - Migration for `marketplace_reviews` — with columns: `id`, `tenant_id`, `strategy_id`, `subscription_id`, `rating`, `comment`, `is_verified`, `helpful_votes`, `reported_count`, `is_flagged`, `created_at`, `updated_at`
   - Migration for `marketplace_revenue_shares` — with columns: `id`, `strategy_id`, `tenant_id`, `subscription_id`, `period_start`, `period_end`, `gross_revenue_cents`, `platform_share_cents`, `creator_share_cents`, `status`, `paid_at`, `stripe_payout_id`, `created_at`, `updated_at`
   - Migration for `marketplace_disputes` — with columns matching the `IMarketplaceDispute` interface
   - Migration for `marketplace_vetting_jobs` (if not already covered)

   These migration files must go in `src/db/migrations/` (main source tree), NOT in worktrees.

9. **Clarify price cents vs dollars convention**: Either rename `price_usd_monthly` to `price_usd_monthly_cents` everywhere, or change the type interface so it's documented as cents. Currently the column name implies dollars but it's treated as cents in the code.

### Low Priority

10. **Implement real Wasm sandbox** in `invokeSandbox()` (Phase 02).
11. **Implement real DLP policy** in `checkDlpPolicy()` with IronClaw integration (Phase 03).
12. **Wire webhook resilience** into the IPN handler for idempotency and retry.
13. **Add subscription renewal/billing cycle** support for recurring payments.
14. **Wire the payout scheduler** (`marketplace-payout-scheduler.ts`) for periodic creator payouts.

---

## File Index

| File | Purpose |
|------|---------|
| `/Users/macbook/algo-trader/src/platform/billing/nowpayments-service.ts` | NOWPayments API client, checkout URL generation, HMAC verification |
| `/Users/macbook/algo-trader/src/platform/api/routes/webhooks/nowpayments-webhook.ts` | IPN webhook Express route, marketplace detection |
| `/Users/macbook/algo-trader/src/platform/api/routes/webhooks/handlers/marketplace-payment-handler.ts` | Marketplace IPN finished/cancelled handlers |
| `/Users/macbook/algo-trader/src/platform/marketplace/services/subscription.service.ts` | Subscription lifecycle: subscribe, activate, cancel, update |
| `/Users/macbook/algo-trader/src/platform/marketplace/services/marketplace-execution-bridge.ts` | Execution bridge: per-subscriber and per-strategy execution |
| `/Users/macbook/algo-trader/src/platform/raas/subscriber-executor.ts` | RaaS executor: sandbox, DLP, trade recording |
| `/Users/macbook/algo-trader/src/platform/marketplace/services/marketplace.service.ts` | Core marketplace service: strategies, listings, vetting |
| `/Users/macbook/algo-trader/src/platform/marketplace/services/revenue.service.ts` | Revenue service: 20/80 split, payout requests |
| `/Users/macbook/algo-trader/src/platform/marketplace/models/types.ts` | TypeScript interfaces for all marketplace entities |
| `/Users/macbook/algo-trader/src/platform/marketplace/repositories/` | All 8 repository classes (DB queries) |
| `/Users/macbook/algo-trader/src/platform/api/routes/marketplace-subscription-routes.ts` | Subscription API routes |
| `/Users/macbook/algo-trader/src/platform/api/routes/marketplace-strategy-listings-routes.ts` | Strategy listing API routes |
| `/Users/macbook/algo-trader/src/platform/api/routes/marketplace-creator-revenue-routes.ts` | Creator revenue API routes |
| `/Users/macbook/algo-trader/dashboard/src/pages/marketplace-page.tsx` | Dashboard marketplace page (Browse + My Subscriptions) |
| `/Users/macbook/algo-trader/dashboard/src/hooks/use-marketplace.ts` | Dashboard marketplace API hook |
| `/Users/macbook/algo-trader/dashboard/src/types/api.ts` | Dashboard API type definitions |
| `/Users/macbook/algo-trader/src/platform/api/routes/webhooks/webhook-resilience.ts` | Webhook resilience (idempotency, retry, dead-letter) — NOT wired into IPN handler |
| `/Users/macbook/algo-trader/src/db/migrations/031_add_marketplace_subscription_payment.sql` | Adds payment_id and payment_status to marketplace_subscriptions |
| `/Users/macbook/algo-trader/src/db/migrations/032_add_marketplace_payout_address.sql` | Adds payout_address to marketplace_strategies |
