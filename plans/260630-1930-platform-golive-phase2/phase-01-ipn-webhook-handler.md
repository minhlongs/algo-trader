# Phase 01 — IPN Webhook Handler (CF Worker)

**Status:** done | **Priority:** P0 | **Est.:** 30min

## Context

Port NOWPayments IPN webhook từ Express (`nowpayments-webhook.ts`) sang CF Worker handler.
Simplified: không DB — dùng KV cho activation + IPN log.

## Requirements

- **Functional**: Verify HMAC-SHA512 signature, parse payment status, store activation in KV
- **Non-functional**: < 500ms response, idempotent (skip duplicate payment_id)
- **Scope OUT**: Invoice generation, license generation, email notifications, subscription management

## Architecture

```
NOWPayments → POST /api/webhooks/nowpayments
  → HMAC-SHA512 verify (x-nowpayments-sig header)
  → parse status → finished=activate | refunded/failed/expired=cancel | else=ignore
  → KV write: activation:{email} → {tier, paymentId, timestamp}
  → KV write: ipn-log:{timestamp} → {status, paymentId, amount}
  → 200 {received:true}
```

## Implementation Steps

1. Create `src/platform/workers/webhook-handlers.ts`
   - Import Web Crypto API (native on CF Workers)
   - Implement `verifyIpnSignature(rawBody, signature, secret)` using HMAC-SHA512
   - Implement `handleNowPaymentsIpn(request, env)`:
     a. Extract `x-nowpayments-sig` header
     b. Read raw body text
     c. Verify signature
     d. Parse JSON body
     e. Map status → action (finished=activate, refunded/failed/expired=cancel, else=ignore)
     f. On activate: write KV `activation:{email}` and log
     g. On cancel: write KV log
     h. Return 200

2. Export handler functions for edge-proxy route table

## Edge Cases

- Missing signature header → 400
- Invalid signature → 401
- Duplicate payment_id → skip (idempotent)
- Missing IPN_SECRET → 500 (misconfigured)
- Malformed JSON → 400
- KV write failure → log, still return 200 (don't block NOWPayments)

## Todo

- [ ] Create `src/platform/workers/webhook-handlers.ts`
- [ ] Implement HMAC-SHA512 verification (sorted keys, Web Crypto)
- [ ] Implement status → action mapping
- [ ] Implement KV activation storage
- [ ] Implement KV IPN log
- [ ] Handle all edge cases
- [ ] TypeScript compile check passes
