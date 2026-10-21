---
title: "Go-Live Zero-Bug — Contract Reconciliation, Gate Execution, Evidence"
description: "Sequence real contract fixes, verifier corrections, doc truth-telling, and executed gates so the go-live claim is defensible."
status: awaiting-approval
priority: P1
effort: 10h
branch: feat/triad-apex-deep-refactor-wave180-182
tags: [go-live, readiness, cloudflare-workers, gates, load-test, zero-bug]
created: 2026-10-20
---

# Go-Live Zero-Bug — Plan Overview

## What "zero bug" can and cannot mean here

**Can honestly mean:** every contract a verifier asserts actually holds on the real host; every
gate is *executed* with recorded evidence (not a checkbox claiming it); known gaps are named in
docs instead of hidden; residual risk is enumerated with likelihood x impact.

**Cannot be guaranteed:** zero undiscovered defects. A 12k RPS load test does not prove
correctness — it proves the system survived one synthetic profile for one window. It cannot
prove: settlement/order-routing correctness under adverse market data, unbounded input classes,
third-party (OpenRouter/ElevenLabs/D-ID/NOWPayments) outage behavior, or failure modes of code
paths never exercised in production. "Zero bug" is therefore scoped as
**zero *known* bugs against *asserted* contracts**, plus a rollback stack that bounds the blast
radius of anything unknown.

## Verified baseline (re-probed 2026-10-20, not copied)

| Claim | Status |
|---|---|
| `api.cashclaw.cc/`, `/health`, `/metrics`, `/api/version`, `/api/markets` → 200 | VERIFIED live |
| `api.cashclaw.cc/api/health`, `/api/status` → 501 `VPS backend removed` | VERIFIED live |
| `api.cashclaw.cc/api/foo` (any unregistered `/api/*`) → 501 | VERIFIED live — mismatch is generic |
| `https://algo-trader.pages.dev` → **HTTP 200** (live static Pages site) | VERIFIED |
| `https://cashclaw.cc` → **HTTP 200** | VERIFIED |
| **Gate 5 smoke targets (`ci-gate-deploy-smoke.mjs`) are BOTH healthy — Gate 5 is NOT broken** | VERIFIED |
| `https://algo-trader.workers.dev` → DNS fail, `curl` exit 6 | VERIFIED |
| `me solo gates verify --strict` → `bin/me:1466 reconcile_goal_gate_state: command not found`; non-strict exits 0 | VERIFIED |
| typecheck 0 errors, vitest 17,122 pass/11 skip, quality-baseline 5/5 PASS | VERIFIED |
| 65 dirty files in working tree | VERIFIED |

Two scout citations corrected during re-verification: `notImplementedResponse` is defined at
`src/platform/workers/auth-handler-helpers.ts:74` (scout said edge-proxy-inline-routes.ts:92,
that whole return body was `handleVpsFallbackRoute`, which emits the *same* 501 text via a
separate path when `VPS_ORIGIN` is set). Scout's causal claim — unregistered `/api/*` → 501 — holds.
`/api/v1/shard/ring` returning 401 is *correct auth enforcement*, not a bug
(`src/platform/workers/edge-proxy.ts:114`).

**Correction to an earlier draft of this table:** it claimed `algo-trader.pages.dev` DNS-failed and
that Gate 5 was therefore broken. Both were wrong — the host resolves and serves 200. Gate 5
should be left alone; only `scripts/final-integration-check.js` (which probes the non-resolving
`algo-trader.workers.dev` at `/api/health`, `/api/status`, `/api/v1/shard/ring`) is broken.

## Phase progress

| # | Phase | Status | Effort | Depends on |
|---|-------|--------|--------|------------|
| 01 | [Baseline snapshot & working-tree hygiene](phase-01-baseline-snapshot-and-tree-hygiene.md) | pending | 1h | — |
| 02 | [Health contract reconciliation (code)](phase-02-health-contract-reconciliation.md) | pending | 2h | 01 |
| 03 | [Verifier host correction: `final-integration-check.js` (Gate-5 smoke is healthy — leave it)](phase-03-final-integration-check-host-correction.md) | pending | 1.5h | 02 |
| 04 | [Load-test gate parameterization (tooling)](phase-04-load-test-gate-parameterization.md) | pending | 1h | 03 |
| 05 | [Load-test execution & evidence (12k RPS)](phase-05-load-test-execution-and-evidence.md) | pending | 2h | 04, 02 |
| 06 | [Rollout doc truth reconciliation](phase-06-rollout-doc-truth-reconciliation.md) | pending | 1h | 02, 03 |
| 07 | [Harness gate repair & ME evidence](phase-07-harness-gate-repair-and-evidence.md) | pending | 1.5h | 06 |
| 08 | [Go/no-go decision & residual-risk register](phase-08-go-no-go-and-residual-risk-register.md) | pending | 1h | 05, 07 |

## Dependency graph

```
01 → 02 → 03 → 04 → 05 ─┐
         └────→ 06 → 07 ─┴→ 08
```

Phase 02 gates 03/06: verifiers must not be repointed until the contract they probe exists.
Phase 07 is last because ME evidence should reflect the *executed* gates, not stale Aug–Sep 2026
artifacts. Phase 08 cannot start before both the load test (05) and the repaired harness (07)
have produced fresh evidence.

## Sequencing rationale (cheap + high-signal first)

Phases 01–03 are type-check-and-curl cheap and eliminate the entire class of "verifier disagrees
with reality" failures. Phase 04 costs nothing and fixes a silently mis-parameterized gate. Only
Phase 05 (12k RPS for 30m) and any multi-region e2e are expensive — they run after every cheap
check has already passed, so a failure there implicates scale rather than contracts.

Of the ~10h total, Phase 05 is the only phase with meaningful wall-clock/risk exposure. Phase 01–03
(the phases that find the real bugs) are roughly 4.5h and can stop there and still leave the system
strictly better than today.

## Explicit work classification

- **(a) Code fixes:** Phase 02 only. One defensive path-registration fix; no new abstraction.
- **(b) Tooling/script corrections:** Phases 03, 04 (hostnames, VUS parameterization).
- **(c) Documentation reconciliation:** Phase 06 (docs over-claim readiness).
- **(d) Gates to EXECUTE with recorded evidence:** Phase 05 (load test), Phase 07 (ME harness).

## Decisions requiring the user (blocking for the named phases)

1. **Is the `/api/health` contract wanted, or should verifiers use `/health`?**
   Phase 02 assumes the *contract* is wanted (serve 200 at `/api/health`), because dashboards,
   k8s-style probes, and existing verifier scripts all expect it and changing 3 consumers is more
   churn than adding one alias. If instead the intended contract is `/health` only, Phase 02
   becomes a 2-line verifier/doc edit instead. **Default: serve `/api/health`.**
2. **Is 12k RPS still the target?** Phase 05 runs at 12,000 VUs for 30m as documented. If the
   real production envelope is single-host Cloudflare Worker with no autoscaling shards, a 12k
   RPS target may be a paper number that will fail for reasons that do not matter in production.
   **Default: execute as documented, then report actual headroom honestly.**
3. **Is multi-region actually desired?** `scripts/final-integration-check.js` claims 3 regions
   (us-east, eu-central, ap-southeast) that all point at the same dead hostname; live topology is
   one Worker behind one route (`wrangler.toml:94-96`, zone `cashclaw.cc`). Phase 03 repairs the
   *probes*; it deliberately does **not** fabricate 3 regions. **Default: collapse to the real
   1-region topology and mark multi-region as unbuilt.** Standing up 3 real regions is a separate
   epic, out of scope here.
4. **`me-deep-wrapper` is a separate git repo** (`github.com/minhlongs/me-deep-wrapper`). Phase 07
   fixes it upstream, not in this repo. Confirm you want that repo touched.

## Global success criteria

- No verifier in `scripts/` probes a hostname that does not resolve.
- `/api/health` returns 200 on `api.cashclaw.cc` *and* locally via wrangler dev.
- A 12k RPS load-test run exists as an artifact with pass/fail and p95, recorded under the plan.
- `docs/production-rollout-plan.md` unchecked items are either executed and checked, or
  explicitly labeled out-of-scope with a dated reason.
- ME harness verifies without the `command not found` abort, with fresh (Oct 2026) evidence.
- Every gate claim in this plan is proven by a recorded command output, never by assertion.
