# Go-Live Zero-Bug Readiness Scout (pre-plan evidence)

**Date:** 2026-10-20
**Question asked:** how to build `/goal` go-live zero-bug for this project, `--deep`

## Verified findings

All findings below were checked against source, live endpoints, or the harness itself — not assumed.

### 1. Production IS live, but partially migrated

| Probe | Result |
|-------|--------|
| `https://api.cashclaw.cc/` | HTTP 200 |
| `https://api.cashclaw.cc/health` | HTTP 200 |
| `https://api.cashclaw.cc/metrics` | HTTP 200 |
| `https://api.cashclaw.cc/api/health` | **HTTP 501** `{"error":"Not implemented","message":"VPS backend removed — endpoint not yet migrated to CF Worker"}` |
| `https://api.cashclaw.cc/api/status` | **HTTP 501** (same message) |
| `https://api.cashclaw.cc/api/v1/shard/ring` | **HTTP 401** (auth required) |
| `https://algo-trader.workers.dev/*` | DNS does not resolve (`curl_exit=6`) |

**Root cause of the 501s:** `src/platform/workers/edge-proxy.ts` registers `/health` (bare), not
`/api/health`. Unhandled `/api/*` paths fall through to `notImplementedResponse(path)`
(`src/platform/workers/edge-proxy-inline-routes.ts:92`) when `VPS_ORIGIN` is unset.

### 2. The go-light gate documents disagree with the deployed reality

`docs/production-rollout-plan.md` marks **technical readiness complete** (all 11 scaling phases,
TS compile, integration tests, load-test scripts, CI/CD, monitoring) but every **operational**
item is unchecked, and the pre-deployment success criteria are all unchecked:

- "Run full load test (12k RPS for 30m)" — never run. `tests/load/raas-gateway-load-test.js`
  defaults to `VUS=5000`, not 12,000, so the gate is also mis-parameterized.
- On-call notified, Slack channel, incident runbook, DB backups, Redis/NATS health — all unchecked.
- "All 12 phases marked complete" — unchecked.

**Conclusion:** the "zero bug go-live" gap is not code rot. It is that the gate was never executed,
plus a live contract mismatch between what the deploy verifiers probe and what the Worker serves.

### 3. The gate verifier itself is broken (upstream, not this repo)

`bash ~/Documents/me-deep-wrapper/bin/me solo gates verify --strict` aborts with:
`reconcile_goal_gate_state: command not found` (call site `bin/me:1466`, function never defined).
The same missing function also breaks `me solo gates reconcile`.

The reconcile step prints `MISS` for company-blueprint / offer-validated / scale-ready even though
the underlying evidence artifacts exist with `status: passed`/`ready` (stale Aug–Sep 2026
timestamps) — so the `MISS` output is unreliable until the script is fixed.

`CurrentGate: fulfillment-stable`; the 8 earlier gates are recorded passed.

### 4. Repo quality state (verified, healthy)

- `npm run typecheck` → 0 errors.
- `npx vitest run` → 17,122 passed / 11 skipped (1,343 files), 0 failures.
- `node scripts/check-quality-baseline.mjs --quality` → 5/5 PASS (0 `:any`, 0 banned imports,
  0 new eslint-disables, 0 files over the 200-LOC hard limit).
- Max file size in `src/`: 159 LOC. Hard gate 200 LOC already satisfied with headroom.

### 5. Deploy verification scripts point at wrong/missing hosts

- `scripts/final-integration-check.js` probes `/api/health` and `/api/status` against
  `algo-trader.workers.dev` for all 3 "regions" — a hostname that does not resolve. All three
  regions resolve to the same host, so multi-region verification is not actually multi-region.
- `scripts/ci-gate-deploy-smoke.mjs` (Gate 5) probes `https://algo-trader.pages.dev` (does not
  resolve) and `https://cashclaw.cc`.

### 6. Working tree is dirty

63 changed files from the deep-modularization wave just completed (not yet committed).
Any deploy path runs `git status` dirty checks.

## Implications for the plan

A "go-live zero bug" goal must therefore be sequenced as:
contract reconciliation → gate execution (not just claiming) → deploy verification against the
REAL host → only then multi-region/scale claims.

The two things most likely to bite on first deploy: (a) `/api/health` returning 501 while the
verifier demands 200, and (b) the empty 12k RPS load-test gate.

## Unresolved Questions

None blocking planning.
