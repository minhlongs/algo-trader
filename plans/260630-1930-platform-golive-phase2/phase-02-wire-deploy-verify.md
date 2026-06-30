# Phase 02 — Wire Routes + Deploy + Verify

**Status:** done | **Priority:** P0 | **Est.:** 15min

## Context

Wire new webhook handler into edge-proxy route table, deploy, verify endpoints.

## Implementation Steps

1. Edit `edge-proxy.ts`:
   - Import `handleNowPaymentsIpn` from webhook-handlers
   - Add `NOWPAYMENTS_IPN_SECRET?: string` to Env interface
   - Add route: `POST /api/webhooks/nowpayments` → `handleNowPaymentsIpn(request, env)`

2. TypeScript check: `npx tsc -p tsconfig.worker.json --noEmit`

3. Deploy: `mv /Users/macbook/wrangler.jsonc /tmp/ && npx wrangler deploy && mv /tmp/wrangler.jsonc /Users/macbook/`

4. Verify:
   - `POST /api/webhooks/nowpayments` (no sig) → 400
   - `POST /api/webhooks/nowpayments` (invalid sig) → 401
   - `GET /api/health` → 200
   - All existing endpoints still work

## Todo

- [ ] Edit edge-proxy.ts (import + route + Env)
- [ ] TypeScript compile check
- [ ] Deploy to algo-trader worker
- [ ] Verify HTTP responses (400, 401, 200)
- [ ] Verify no regression on existing endpoints
