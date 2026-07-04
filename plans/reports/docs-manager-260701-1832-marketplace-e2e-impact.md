# Docs Impact Report: Marketplace E2E Wiring

**Docs impact: minor**

## What Changed

Full end-to-end marketplace subscription flow implemented across 14 new files and 8 modified files:

1. **Subscription service** — subscribe(), activateByPaymentId(), cancelByPaymentId(), updateSubscription()
2. **Marketplace Payment Handler** — NOWPayments IPN `finished` → subscription activation + revenue share
3. **Marketplace Execution Bridge** — auto-triggers RaaS SubscriberExecutor on active subscriptions
4. **Revenue Reconciliation** (Phase 04) — payout scheduler (BullMQ weekly cron), creator API, admin mark-as-paid
5. **Dashboard UI** — MarketplacePage (browse/filter/subscribe/manage), SubscriptionDetail, ConfirmationDialog
6. **Payment polling** — auto-polls subscription status after NOWPayments checkout redirect
7. **Security audit** — typed auth context in marketplace routes (removed `(req as any)` casts)
8. **Strategy auto-seed** — 5 marketplace strategies seeded on server startup ($79-$149/mo)
9. **New env var**: `NOWPAYMENTS_IPN_URL` (IPN callback URL)

## Docs Updated

| Doc | Change |
|-----|--------|
| `docs/project-changelog.md` | Added `[3.1.0] - 2026-07-01` entry with all marketplace e2e changes |
| `docs/deployment-guide.md` | Added `NOWPAYMENTS_IPN_URL`, `NOWPAYMENTS_INVOICE_PRO`, `NOWPAYMENTS_INVOICE_ENTERPRISE` env vars + Marketplace Setup checklist |
| `docs/development-roadmap.md` | Updated Phase 36 from "Planned" to "In Progress" with implemented checkboxes |
| `docs/system-architecture.md` | Expanded marketplace module description to mention payment flow + execution bridge; updated date |
| `.env.example` | Added `NOWPAYMENTS_IPN_URL` to NOWPayments section |

## Gaps Identified

- `docs/api-subscription.md` covers the old license subscription API, not marketplace subscriptions. Not updated (separate system; marketplace subscription routes are at `/v1/marketplace/subscriptions`)
- No dedicated marketplace API doc exists. Consider creating `docs/marketplace-api.md` if marketplace endpoints grow further.
- The revenue reconciliation Phase 04 (payout scheduler, creator revenue API) has no dedicated doc. Low priority — covered by changelog entry.

## Verdict

**Docs impact: minor.** The architecture is unchanged (marketplace module still in platform context). Updates focus on documenting new env vars, updating the changelog, and marking roadmap progress. No structural doc changes needed.
