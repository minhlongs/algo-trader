---
status: pending
priority: P0
---

# Phase 1: Mount NOWPayments Webhook Router

## Context
`server.ts` line 29 imports `nowpaymentsWebhookRouter` but `setupRoutes()` never mounts it. Every NOWPayments IPN callback returns 404. This is a 30-minute fix that unblocks $0 → $1K MRR.

## Related
- Report: `plans/reports/from-workflow-synthesis-to-planner-260712-1110-unblock-payment-gate-report.md`
- Ref: `src/platform/api/server.ts` (lines 25-35 import section, setupRoutes method)
- Ref: `src/platform/api/routes/nowpayments-webhook-routes.ts` (the router to mount)

## Files to Modify
1. `src/platform/api/server.ts` — add webhook mount in `setupRoutes()`

## Implementation Steps

1. Open `src/platform/api/server.ts`
2. Locate `setupRoutes()` method
3. Add `this.app.use('/api/webhooks/nowpayments', nowpaymentsWebhookRouter)` — ideally near other webhook mounts
4. Verify the import at top of file includes the router
5. Run `npm run typecheck` — must pass 0 errors
6. Run `npx vitest run src/platform/api/__tests__/nowpayments-webhook-routes.test.ts` (or matching test path)

## Success Criteria
- `POST /api/webhooks/nowpayments` responds (not 404)
- Existing NOWPayments IPN E2E tests still pass (5/5 green per prior phase)
- No TypeScript errors

## Risk
- None — adding a mount point to an already-built, tested router
