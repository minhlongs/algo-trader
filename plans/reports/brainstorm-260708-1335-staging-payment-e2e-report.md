# Brainstorm: Staging Payment E2E — Pre-Production Revenue Gate
**Date:** 2026-07-08 | **Schema:** [config:meta-property-default] | **Repo:** @mekong/algo-trader

---

## Problem Statement

The go-live checklist (`docs/go-live-status.md`) flags **"End-to-end test payment flow on staging"** as incomplete. Current state: IPN handler works with mocked webhooks (5/5 unit tests pass), but no real NOWPayments sandbox transaction has traversed the full live path:

```
Browser/Customer → NOWPayments invoice → IPN callback → handler → subscription DB → license DB
```

The CEO cannot honestly sign off on production payment readiness until this chain is exercised in a staging environment that mirrors production.

---

## Evaluated Approaches

### A. Staging E2E via NOWPayments Sandbox (RECOMMENDED)
- **Setup:** Create NOWPayments sandbox merchant account → get test API key + IPN secret → use `api-test.nowpayments.io` endpoints
- **CF Worker staging env:** `wrangler.toml` environments block for `staging` → deploys to `algo-trader-staging.workers.dev`
- **E2E test:** Create invoice in sandbox → complete payment via NOWPayments test flow → receive IPN → verify subscription + license in D1/JSON
- **Validation checklist:** IPN signature verified, subscription active, license created, bidirectional link set
- **Pros:** Tests the real production path in safe sandbox; unblocks "first paying customer" gate; gives CEO confidence
- **Cons:** Requires NOWPayments merchant account setup (15-30 min signup + KYC-light for sandbox)

### B. Security Hardening First
- HSTS header, NOWPayments webhook signature enforcement, exchange 2FA whitelist
- **Pros:** Reduces production attack surface
- **Cons:** Does NOT unblock revenue; CEO sign-off on payment readiness remains blocked regardless

### C. All Three in Parallel
- Staging E2E + Security Hardening + Exchange Readiness simultaneously
- **Pros:** Fastest wall-clock
- **Cons:** Parallel infra work = more conflict surface; staging env config touches CF Worker while security touches Express routes and exchange config — different surfaces but shared deployment pipeline

---

## Decision

**Approach A: Staging E2E via NOWPayments Sandbox**

Rationale:
- Unblocks the specific go-live item flagged as incomplete
- Provides real-path validation before production traffic
- Gives the CEO the evidence needed for sign-off
- Security hardening (B) can run in parallel after staging is green — it doesn't depend on staging E2E

---

## Design

### Phases

**Phase 1: NOWPayments Sandbox Account**
- Register merchant at NOWPayments (test mode)
- Get test API key + IPN secret + create test invoices for PRO/ENTERPRISE tiers
- Add sandbox values to `staging.env` (gitignored)

**Phase 2: CF Worker Staging Environment**
- Add `staging` environment to `wrangler.toml`
- Create `wrangler.staging.jsonc` with staging-specific vars
- Wire `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_IPN_URL` to staging env
- Deploy: `wrangler deploy --env staging`

**Phase 3: Staging E2E Test Script**
- Create `scripts/test-payment-e2e.sh` (or `.mjs`) that:
  1. Creates a NOWPayments test invoice via API (sandbox)
  2. Polls for payment status (sandbox allows instant test payment)
  3. Triggers IPN callback (or waits for NOWPayments test mode to send it)
  4. Curls staging `/api/v1/subscriptions/:id` to verify activation
  5. Verifies license exists and is linked
- **Acceptance:** All 4 checks pass in sequence; no manual intervention

**Phase 4: Verify + Document**
- Run E2E script on staging, capture output
- Update `docs/go-live-status.md`: mark "Test payment flow end-to-end" as ✅
- Update `docs/ceo-morning-brief.md`: add staging E2E pass note
- Commit with conventional message

---

## Non-Negotiable Constraints

| Constraint | Detail |
|---|---|
| **No live keys in repo** | Sandbox keys go in `staging.env` (gitignored), not committed |
| **CF-direct deployment** | Must use `wrangler deploy --env staging`, no GitHub Actions |
| **No production impact** | Staging and production are separate CF environments — no production data at risk |
| **Vitest unaffected** | This work doesn't touch test files; existing 1397/1397 stays green |
| **NOWPayments only** | Do NOT introduce Polar, Stripe (card), or other providers in this phase |

---

## Success Metrics

| Check | Pass Criteria |
|---|---|
| NOWPayments sandbox account | Test API key + IPN secret in hand |
| Staging deploy | `curl https://algo-trader-staging.workers.dev/api/health` → 200 |
| Invoice creation | POST to NOWPayments sandbox → invoice ID returned |
| Payment simulation | NOWPayments test mode marks payment `finished` |
| IPN delivery | Handler receives webhook, processes without error |
| Subscription created | GET `/api/v1/subscriptions?email=...` → active, correct tier |
| License linked | GET subscription → `licenseId` populated |
| Script runs clean | `scripts/test-payment-e2e.sh` exits 0 with no manual steps |

---

## Touchpoints (Files to Modify/Create)

| File | Action | Why |
|---|---|---|
| `wrangler.toml` | Add `staging` environment block | CF Worker staging deploy target |
| `wrangler.staging.jsonc` | Create | Staging-specific env vars (gitignored reference) |
| `staging.env` | Create | NOWPayments sandbox keys (gitignored) |
| `.gitignore` | Verify `staging.env` listed | Prevent key leak |
| `scripts/test-payment-e2e.sh` | Create | Automated E2E validation script |
| `docs/go-live-status.md` | Update | Mark staging E2E green |
| `docs/ceo-morning-brief.md` | Update | Reflect staging pass |

Files READ-ONLY (no modification):
- `src/platform/api/routes/webhooks/handlers/subscription-handler.ts` — verify current logic
- `src/platform/billing/nowpayments-service.ts` — understand API client
- `src/platform/billing/subscription-service.ts` — understand subscription persistence

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| NOWPayments sandbox account creation delayed | Medium NOWPayments requires company info + email verification | Plan includes clear signup steps; user executes them |
| Sandbox IPN delivery unreliable | Low NOWPayments test mode is designed for this | Fallback: trigger IPN manually via `scripts/simulate-ipn.sh` (already has pattern in codebase) |
| Staging env conflicts with production vars | Low Separate CF environment = isolated state | Verify `NOWPAYMENTS_IPN_URL` points to staging endpoint |
| Script becomes stale as API evolves | Low NOWPayments API v1 is stable | Lock to specific sandbox endpoint; document API version |

---

## Out of Scope (This Round)

- Security hardening (HSTS, webhook sig enforcement) — follow-up after staging green
- Exchange 2FA + live capital — separate stream, not blocking revenue gate
- Stripe card payments — out of scope per CEO-HANDOVER (NOWPayments primary)
- Production deploy — this validates staging ONLY

---

## Dependencies

1. **User:** NOWPayments sandbox merchant account (one-time setup, ~15 min)
2. **User:** Approval to create CF staging environment
3. **None external:** All code changes are local config + script

---

## Next Steps After This Plan

Once staging E2E passes:
1. Security hardening sprint (HSTS + webhook signature verification)
2. Exchange readiness (2FA + read-only keys)
3. First Beta pilot — invite 1-3 trusted testers
4. Production deploy with confidence
