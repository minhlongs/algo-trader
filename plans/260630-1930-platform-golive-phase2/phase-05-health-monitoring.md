# Phase 05 — Health Monitoring

**Status:** done | **Priority:** P1 | **Est.:** 30min

## Context

CF-native health monitoring không cần external service.
Dùng `/api/health` endpoint có sẵn + thêm IPN failure tracking.

## Implementation Steps

1. Enhance `/api/health` response with IPN stats:
   - `ipnReceived`: count from KV
   - `ipnLastSuccess`: timestamp of last successful IPN
   - `ipnLastFailure`: timestamp of last failed IPN
   - `uptime`: worker startup time

2. Add KV-based IPN counter:
   - On each IPN: increment `metric:ipn-total`
   - On IPN failure: increment `metric:ipn-failed`

3. Optional: CF Worker Cron trigger (every 5min):
   - Self-check: call /api/health internally
   - If unhealthy → log to KV alert log
   - (Skip for now — YAGNI)

4. Verify: `GET /api/health` returns enhanced response

## Todo

- [ ] Enhance health response with IPN metrics
- [ ] Add IPN counter tracking in KV
- [ ] Test health endpoint
- [ ] (Optional) Set up CF Worker cron for self-check
