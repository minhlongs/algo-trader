# Phase A — Billing Polish + Dead Code Removal

**Priority:** P1 | **Effort:** 1 day | **Dependencies:** none

## Context Links

- Plan: `plan.md`
- Brainstorm: `plans/reports/260708-2000-billing-polish-mcp-brainstorm-report.md`
- Related: `plans/260708-0255-phase-a-billing-polish-plus-phase-b-mcp/phase-a-billing-polish.md`

## Overview

Remove dead NOWPayments integration code and placeholder env vars left from the Polar rejection. Two items remain from the original Phase A spec:

1. **Dead payment functions** — `signNOWPaymentsWebhook` + `verifyNOWPaymentsSignature` still in `payment-service.ts` (no callers)
2. **Dead env vars** — `NOWPAYMENTS_INVOICE_MASTER` + `NOWPAYMENTS_INVOICE_SIGNALS_*` placeholders still in `.env.example`

Already done (prior session): `/usage/:subscriberId` wired ✓, Telegram `/link` D1-backed ✓

## Requirements

- Delete `signNOWPaymentsWebhook` and `verifyNOWPaymentsSignature` from `payment-service.ts`
- Delete related NOWPayments env var placeholders from `.env.example`
- Verify zero callers via grep before deleting
- All tests pass after removal

## Related Code Files

| File | Action |
|------|--------|
| `src/platform/billing/payment-service.ts` | Delete lines 99–105 (2 dead methods) |
| `.env.example` | Delete lines 112–115 (4 dead env var placeholders) |

## Implementation Steps

1. **Grep for callers** — `grep -rn "signNOWPaymentsWebhook\|verifyNOWPaymentsSignature" src/` → expected: 0 results outside `payment-service.ts`
2. **Delete dead methods** — Remove lines 99–105 from `payment-service.ts`. Verify file still imports cleanly.
3. **Delete dead env vars** — Remove lines 112–115 from `.env.example` (commented placeholders for `NOWPAYMENTS_INVOICE_MASTER`, `NOWPAYMENTS_INVOICE_SIGNALS_BASIC`, `NOWPAYMENTS_INVOICE_SIGNALS_PRO`, `NOWPAYMENTS_INVOICE_SIGNALS_ENTERPRISE`)
4. **Run tests** — `npx vitest run` → all green

## Todo List

- [ ] Grep for callers of dead NOWPayments functions (must be 0)
- [ ] Delete `signNOWPaymentsWebhook` + `verifyNOWPaymentsSignature` from `payment-service.ts`
- [ ] Delete `NOWPAYMENTS_INVOICE_MASTER` + `NOWPAYMENTS_INVOICE_SIGNALS_*` from `.env.example`
- [ ] Run `npx vitest run` — all tests pass

## Success Criteria

- `grep -rn "signNOWPaymentsWebhook\|verifyNOWPaymentsSignature" src/` returns 0 results
- `grep -rn "NOWPAYMENTS_INVOICE_MASTER\|NOWPAYMENTS_INVOICE_SIGNALS"` returns 0 results in `.env.example`
- `npx vitest run` exit 0

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Dead functions have indirect callers via `this` | Low | Grep entire `src/` before deleting — already confirmed 0 callers |
| Env vars referenced in staging docs | Low | These are commented placeholders, not active config |
