# Marketplace Workers / Notifications Status Report

**Date:** 2026-06-29  
**Scope:** `/Users/macbook/algo-trader/src/marketplace/`

---

## What Exists

| Item | Status |
|------|--------|
| `src/marketplace/workers/` | Directory exists but **empty** (no files) |
| `src/marketplace/notifications/` | Directory exists but **empty** (no files) |
| `src/marketplace/services/revenue.service.ts` | Fully implemented (221 lines) — revenue calculations, payout requests, revenue reports |
| `src/marketplace/services/marketplace.service.ts` | Implemented — strategy CRUD, listing lifecycle |
| `src/marketplace/services/subscription.service.ts` | Present |
| `src/marketplace/services/vetting.service.ts` | Present |
| `src/marketplace/services/dispute.service.ts` | Present |
| `src/marketplace/__tests__/revenue-service.test.ts` | Test exists |
| `src/marketplace/__tests__/` | 13 test files total (all repository/service focused) |

---

## What's Missing

1. **No worker files** — `workers/` directory is a placeholder with zero implementation
2. **No notification files** — `notifications/` directory is a placeholder with zero implementation
3. **No references to workers or notifications anywhere** — `grep` across all `.ts` files in `src/marketplace/` returned zero matches for "workers", "notifications", "NotificationService", or "Worker"
4. **No notification service** — no `NotificationService`, no email/push/in-app notification dispatch
5. **No background workers** — no payout processing worker, no vetting job worker, no subscription renewal worker, no dispute escalation worker

---

## What Needs Implementation

Based on the existing marketplace architecture (revenue splits, subscriptions, vetting, disputes), the following workers and notifications are implied but absent:

### Workers (`src/marketplace/workers/`)
- **PayoutWorker** — process pending revenue shares, mark as paid, trigger payout notifications
- **VettingWorker** — background job to run strategy vetting pipelines (currently only the repository/service layer exists)
- **SubscriptionRenewalWorker** — handle subscription lifecycle events (renewal, expiry, cancellation)
- **DisputeEscalationWorker** — auto-escalate stale disputes after timeout

### Notifications (`src/marketplace/notifications/`)
- **NotificationService** — central dispatch for in-app/email notifications
- **Notification types needed:**
  - `payout_processed` — creator notified when payout is marked paid
  - `vetting_result` — creator notified of approve/reject
  - `subscription_renewed` / `subscription_expired` — subscriber notifications
  - `dispute_opened` / `dispute_resolved` — both parties notified
  - `strategy_listed` — creator confirmation

### Integration Points
- `revenue.service.ts` `requestPayout()` and `getRevenueReport()` should trigger payout notifications
- `subscription.service.ts` should trigger subscription lifecycle notifications
- `vetting.service.ts` should trigger vetting result notifications
- `dispute.service.ts` should trigger dispute notifications
- Workers should be wired into the existing queue system (BullMQ/NATS JetStream per CLAUDE.md)

---

## Unresolved Questions

1. What notification channels are required? (in-app only, email, push, or all three?)
2. Should workers use BullMQ (already in infra per CLAUDE.md) or a different queue?
3. Is there a notification template system or should templates be inline?
4. What is the expected retry/failure behavior for failed notifications?
