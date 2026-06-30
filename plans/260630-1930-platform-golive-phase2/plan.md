# Plan — Platform Go-Live Phase 2 (CF-Only)

**Date:** 2026-06-30 | **Parent:** [brainstorm](../../../plans/reports/brainstorm-260630-1930-platform-go-live-phase2.md)
**Status:** in_progress (04/05 phases complete)

## Context

CF-only backend deployed (algo-trader worker). Platform API: health, auth, stats, coupons, webhooks all operational. E2E payment flow verified (invoice → IPN → activation → health metrics).

## Phase Overview

| # | Phase | Priority | Est. | Status |
|---|-------|----------|------|--------|
| 01 | IPN Webhook Handler (CF Worker) | P0 | 30min | ✅ Done |
| 02 | Wire Routes + Deploy + Verify | P0 | 15min | ✅ Done |
| 03 | Set Secrets + E2E Payment Test | P0 | 20min | ✅ Done |
| 04 | Launch Content Posting | P1 | 1h | ⏳ Pending |
| 05 | Health Monitoring | P1 | 30min | ✅ Done |

## E2E Test Results (2026-06-30)

- Invoice creation: ✅ (iid=5578932922 via API key)
- IPN HMAC verify: ✅ (deep sort + Web Crypto + constant-time)
- Status normalization: ✅ (finished→paid, 11 mappings)
- KV activation: ✅ (idempotent by payment_id)
- Health metrics: ✅ (total=5, lastSuccess=999888777)

## Key Decisions

- **Simplified IPN**: No DB — KV storage for activations + IPN logs
- **No invoice generation**: Skip for CF-only (NOWPayments sends receipt)
- **No license generation**: Skip — tier activation is KV-based
- **HMAC verification**: Web Crypto API (native on CF Workers, no polyfill)

## Dependencies

- `NOWPAYMENTS_IPN_SECRET` — cần set làm wrangler secret
- `CLOUDFLARE_API_TOKEN` — có sẵn
- Wrangler deploy — working (root wrangler.jsonc cần temp move)

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/platform/workers/webhook-handlers.ts` | NEW | IPN verify + activation |
| `src/platform/workers/edge-proxy.ts` | EDIT | Wire webhook route |
| `src/platform/workers/stats-handler.ts` | EDIT | Add IPN health to stats |

## References

- [Brainstorm report](../../../plans/reports/brainstorm-260630-1930-platform-go-live-phase2.md)
- [Go-live checklist](../../../docs/golive-checklist.md)
- [Launch content](../../../docs/marketing/golive-launch-content.md)
- [NOWPayments IPN docs](https://docs.nowpayments.io/ipn)
