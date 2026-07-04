# Phase 04 — My Subscriptions Manage UI

**Priority:** P1 | **Status:** pending | **Est:** 2h | **Deps:** Phase 02

## Goal

My Subscriptions tab fully functional: view active subscriptions, pause/resume/cancel, view P&L.

## Steps

### 4.1 Audit My Subscriptions tab

- [ ] Check if `loadSubscriptions()` is called on mount
- [ ] Check if subscription cards show: strategy name, status, P&L, allocation
- [ ] Check if pause/resume/cancel buttons exist
- [ ] Check if buttons call `updateSubscription(id, action)`

### 4.2 Implement missing subscription actions

If actions not wired:
- [ ] Add Pause/Resume/Cancel buttons per subscription card
- [ ] Wire to `updateSubscription(subscriptionId, 'pause'|'resume'|'cancel')`
- [ ] Show confirmation dialog for destructive actions (cancel)
- [ ] Refresh subscriptions list after action

### 4.3 Subscription detail view

- [ ] Show subscription metadata: subscribed date, price paid, allocation
- [ ] Show running P&L from subscription data
- [ ] Show execution history (if available)
- [ ] Link to "Execute" button (Phase 03)

### 4.4 Empty states

- [ ] No subscriptions → "Browse strategies to get started" with link to Browse tab
- [ ] No active subscriptions → "You have no active subscriptions" message

## Expected Output

User sees their subscriptions, can pause/resume/cancel, sees P&L.

## Files

- `dashboard/src/pages/marketplace-page.tsx` (modify)
- `dashboard/src/hooks/use-marketplace.ts` (may need minor additions)
