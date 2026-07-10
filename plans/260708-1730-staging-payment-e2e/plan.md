---
title: Staging Payment E2E — NOWPayments Sandbox
status: pending
priority: P1
effort: medium
branch: staging-payment-e2e
tags: [staging, nowpayments, e2e, billing, go-live]
created: 2026-07-08
---

# Staging Payment E2E Test Plan

Goal: Validate the full payment chain (invoice → IPN → handler → subscription → license) in a staging CF Worker environment before production traffic.

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | NOWPayments sandbox account setup | phase-01-account-setup.md | pending |
| 2 | Staging env config (wrangler + secrets) | phase-02-staging-config.md | pending |
| 3 | Sandbox E2E test execution | phase-03-sandbox-e2e.md | pending |
| 4 | Verify + update docs | phase-04-verify-docs.md | pending |

## Acceptance Criteria

- [ ] NOWPayments sandbox merchant account with test API key + IPN secret
- [ ] Staging CF Worker deploys with sandbox credentials wired via `wrangler secret put`
- [ ] `wrangler deploy --env staging` succeeds
- [ ] `curl https://algo-trader-staging.workers.dev/api/health` → 200
- [ ] E2E script: creates test invoice → triggers sandbox payment → receives IPN → verifies subscription + license
- [ ] scripts/test-payment-e2e.sh exits 0 autonomously
- [ ] `docs/go-live-status.md`: "NOWPayments IPN E2E" moves from 🔴 Blocker to 🟢 Verified
- [ ] `docs/ceo-morning-brief.md`: staging pass recorded

## Dependencies

- User completes NOWPayments sandbox merchant signup (Phase 1)
- CF account auth via `wrangler login`

## Constraints

- No production keys in repo (sandbox keys via `wrangler secret put`, not committed)
- NOWPayments sandbox base: `https://api-test.nowpayments.io/v1`
- Staging KV namespace: reuse existing `6c7199c0259b42db943aa13b200d8ea1`
- Do NOT modify handler code — validate existing production code works end-to-end
