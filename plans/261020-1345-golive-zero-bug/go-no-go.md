# GO / NO-GO — Go-Live Zero-Bug Verdict

**Date:** 2026-10-20
**Plan:** `plans/261020-1345-golive-zero-bug/plan.md`
**Evidence:** `plans/261020-1345-golive-zero-bug/evidence/`

---

## Verdict: **NO-GO** (conditional)

Nothing here says the system is broken. It says the *go-live claim* is not yet
provable: the two blockers with the greatest consequence (12k RPS load test, ME
revenue gate) have never been satisfied, and the contract fix that removes the
most dangerous failure mode is written but **not deployed**.

Live Worker SHA `bca78f2e`; the fixes are now committed on local `049af752`, **not yet deployed**.

---

## CLAUDE.md deploy blockers — verdicts

CLAUDE.md blocks deploy unless: scaling phases 1-11 complete · integration tests
passing · load test 12k RPS validated · ME IDEA PSF gate approved · on-call
engineer notified.

| Blocker | Verdict | Basis |
|---|---|---|
| Integration/unit tests passing | **PASS** | `vitest run` → 17,127 passed / 11 skipped, 0 failed |
| TypeScript compiles | **PASS** | `tsc --noEmit` 0 errors; worker build also 0 errors (3 pre-existing bugs fixed) |
| Quality ratchet | **PASS** | `check-quality-baseline.mjs` 5/5 |
| Load test 12k RPS validated | **FAIL** | Never executed at 12k. Measured locally (`evidence/track-b-capacity-measurement.md`): **200 RPS → p95 3.68 ms / 0% errors**, **1000 RPS → p95 72.89 ms / 0% errors**, then the local harness **crashes** between 1000–1200 RPS (`Error inside ProxyWorker`, `Network connection lost` — a wrangler 4.123.0 harness defect, not the Worker). No CI workflow runs it at 12k (`deploy.yml` runs only 20s/VUS=50). Local ceiling is a floor on production, not a proxy for it. |
| ME IDEA PSF gate approved | **FAIL** | `first-revenue` is `status=passed` with **0 evidence entries** while the verifier prints `MISS first-revenue CurrentMRR=0`. Root cause verified upstream at `me-deep-wrapper/lib/goal-executor-state.sh:198` — `record_gate_evidence` unconditionally sets `current_gate = gate`, and `lib/goal-executor-gates.sh:26-154` never calls it for `first-revenue` unless `current -gt 0`. So a green exit code records only *that the verifier ran*, not that any gate passed. See `evidence/track-c-gate-evidence-audit.md`. |
| Scaling phases 1-11 complete | **NOT CONFIRMED** | Documents assume per-region hosts (`algo-trader.workers.dev`) that do not resolve. Multi-region is **unbuilt**; live topology is one Worker on `api.cashclaw.cc/*`. |
| On-call engineer notified | **NOT DONE** | No record of it anywhere in the repo. |

---

## What was actually fixed (all verified locally)

| Item | Before | After |
|---|---|---|
| `/api/health` | live **501**; advertised by root handler + deploy verifier | routed to `/health` handler; verified 200 via worker harness + `wrangler dev`. Committed in `dbd982de`, **not yet deployed to production** |
| Worker build | 3 real TS errors blocked any local deploy | 0 errors (`missing export type`; a call to `getRegionHealth`, a function that never existed) |
| `tsconfig.worker.json` | `"exclude": []` → compiled test files into the worker bundle | tests excluded; matches base tsconfig convention |
| Dead-host scripts | 23 refs to a non-resolving host across 8 scripts; `final-integration-check.js` could never pass | single source `scripts/lib/host-contract.sh`; 3 scripts corrected, Gate 5 left untouched |
| `verify-multi-region.sh` | expected `status=="healthy"` (worker returns `"ok"`) + read `.latencyMs` (field never existed) | correct expectations; could never have gone green |
| Load test | probed 5 endpoints the Worker does not serve; no WebSocket exists | 5 real public routes; `constant-arrival-rate` on `TARGET_RPS`; p95<100ms + error<1% thresholds |
| **CLAUDE.md rollback** | pointed at a non-resolving host **and** a route that never existed | `wrangler rollback` + real `QWEN_KILL` / `SWARM_QWEN_ENABLED` flags |
| Rollout doc | blanket "technical readiness complete" | verified table; gaps labelled with reasons |
| `wrangler.toml` env blocks | without `routes`, staging + 3 region envs inherited the production route, so **any** `--env` deploy hijacked `api.cashclaw.cc/*` | `routes = []` added to all four; reassignment warning confirmed gone by `--env staging --dry-run`; production route confirmed intact |
| `/api/health` (verification depth) | was verified in source only | built bundle emits the alias (`edge-proxy.js:56`); live `wrangler dev` returns 200 with `status:"ok"`; bodies identical modulo `timestamp`; non-GET correctly 501 |

The CLAUDE.md rollback bug is the one I would fix regardless of schedule: during
an incident it directed operators to a nonexistent endpoint.

---

## Residual risk register

| # | Risk | Likelihood | Impact | Accepted? |
|---|---|---|---|---|
| 1 | 12k RPS capacity unproven; local harness dies at ~1k; live edge already showed p95 ≈110ms at 20 RPS | **High** | High — capacity failure under real load | Not accepted → must be measured (see `evidence/track-b-capacity-measurement.md`) |
| 1b | Local overload causes a **crash**, not graceful degradation. If the production edge shares this behaviour, overload becomes an outage rather than a slowdown | Medium | High — but **unmeasurable locally**, since the death is in the dev harness | Needs the production window to assess |
| 2 | `/api/health` fix not deployed | **Certain** | Medium | Not accepted → deploy is required |
| 3 | `first-revenue` is `status=passed` with **0 evidence** — the gate state asserts a revenue milestone that does not exist (MRR=0). Worse, `record_gate_evidence` (`me-deep-wrapper/lib/goal-executor-state.sh:198`) unconditionally sets `current_gate = gate`, so **a green verify exit code records only that the verifier ran, never that a gate passed** | **High** | High — any reader of `me solo gates` output is misled about progress | Not accepted → see `evidence/track-c-gate-evidence-audit.md`; the fix is upstream, and the status must be restated to `pending`, never edited to pass |
| 4 | 77 uncommitted files; deploy would silently include an unreviewed deep-refactor wave | **Certain** | Medium-High | Not accepted → commit & review first |
| 5 | Multi-region unbuilt but assumed by 5+ scripts | **Medium** | Medium | Documented in Phase 03/06 |
| 6 | CDN/plan (not code) may cap RPS | Medium | Medium | Must be distinguished from a code defect |
| 7 | Worker endpoints never exercised by any load test (auth, coupons, telegram, webhooks) | Medium | Medium | Known scope limit |
| 8 | `tsconfig.worker.json` change could mask worker-only type errors in CI | Low | Low | Verified: `tsc -p tsconfig.worker.json` exits 0; CI Gate 1 runs `tsc --noEmit` separately |
| 9 | `me solo gates verify --strict` still broken (upstream) | Medium | Low | Non-strict path works |
| 10 | **Any `--env <x>` deploy reassigns `api.cashclaw.cc/*` off production.** `wrangler.toml:107-125` defines staging + 3 region envs with no `routes` key, so all inherit the top-level route | **Certain** | **Critical** — production serves staging code | **MITIGATED** — `routes = []` added to all four env blocks and dry-run verified (`evidence/track-a-deploy-readiness.md`) |
| 11 | `/api/health` reports `d1: "missing"` and `metrics: false` despite bindings existing | Medium | Low-Medium — health check is not a full readiness signal | Open; does not block the 200 contract |
| 12 | `first-revenue` artifact would need a Polar provider to satisfy the strict contract, but the project uses NOWPayments (Polar is an explicitly rejected vendor) | Certain | Medium — strict gate is unsatisfiable as written | Upstream bug, not an artifact gap |
| 13 | `region-health-monitor.ts` carries both work tracks in one hunk, so the go-live deploy diff cannot be isolated by file | **Certain** | Medium | See `evidence/track-d-commit-separation-plan.md`; review the Track G diff hunk-by-hunk instead |

---

## Conditions to reach GO

| # | Condition | Status | What remains |
|---|---|---|---|
| 1 | Deploy the contract fix | **READY — TREE CLEAN, DIFF REVIEWABLE** | Landed as `dbd982de` and verified independently deployable: in an isolated worktree with only that commit's files, `tsc --noEmit` exits 0, `tsc -p tsconfig.worker.json` exits 0, and 17125 tests pass. Fix itself verified end-to-end — bundle emits the alias, live `wrangler dev` returns 200 for both paths, tests are fail-open. |
| 2 | Commit & review the 77 files | **DONE** | Split into 5 commits (`dbd982de` deployable-alone, `66d2b580` tooling, `36da325d` refactor wave, `e9e3d004` records, `049af752` dead-host follow-ups). The clean per-track split is impossible — `region-health-monitor.ts` carries both tracks in one unsplittable hunk — so C1 is cherry-pickable rather than surgically pure. See `evidence/track-d-commit-separation-plan.md`. |
| 3 | Measure capacity honestly | **STILL OPEN, NOW BOUNDED** | 12k is not provable locally: the local harness *crashes* above ~1000 RPS rather than degrading, so no local number extrapolates to the edge. Two honest options remain: a distributed k6 run against production in an approved window, or revise the target to what is measured and state the caveat. The second is defensible today. |
| 4 | Fix the gate evidence | **RESOLVED → MUST NOT "FIX"** | The gate is not evidence-free, it is **mislabeled**: the artifact says `current_mrr: 0` (truthful) beside `status: "passed"` (false). Upstream bug means green exit codes prove nothing. Do **not** edit the status to make it pass. Correct action: restate to `pending` in the upstream repo, or accept MRR=0 as the gate answer. |
| 5 | Notify on-call | **NOT DONE** | No record anywhere in either repo. |

**Deploy is now the only mechanical step left.** With the tree clean and the
route-takeover guarded, `dbd982de` can be deployed as-is:
`npx wrangler deploy --config wrangler.toml`, then confirm
`https://api.cashclaw.cc/api/health` returns 200.

Only after 1–4 does "zero bug" mean something defensible: *no known bug against an
asserted contract, with the gate actually run*.
