# Strategic Assessment — algo-trader 2026-08-02

## 1. TL;DR

The team is mid-compliance-tenant sprint with scattered subagent runs and zero documented outcomes. Audit wiring is complete and feature-flagged in the working tree, but pnpm test shows 117 failures across 31 files plus 5 unhandled errors — blocking the Code→Deploy hand-off per the project's own rules. Immediate priority is test triage and outcome documentation, not new features.

## 2. Reframed Problem

Two parallel tracks are in flight:

- Compliance-tenant sprint (technically complete, uncommitted): audit hooks, tenant context module, endpoint scoping in referral/personalization/routes
- GTM Stage 1 F2 fix (in-progress): billing/notification test mocks, marketplace payout scheduler

Neither track has a "What Worked / What's Left" narrative document. Only run-level reports exist in `plans/reports/` (dated 2026-08-01). The real question: **how does the user stabilize the codebase so the Phase 3 → Phase 4 hand-off can proceed?**

### Goals
- Get the test suite to a reliable state so Code phase can hand to Deploy
- Document outcomes so the next session starts from knowledge, not scratch

### Non-Goals
- New features or refactoring beyond stabilizing tests
- Committing uncommitted work without user direction

## 3. What the Current State Tells Us About Recent Focus

| Signal | Interpretation | Confidence |
|--------|---------------|------------|
| 31 failed test files, 117 failures | Not all from compliance sprint — pre-existing regressions from phase-35 (market data, polymarket adapter, billing, signal fusion, strategies) | High |
| Credentials test: `ECONNREFUSED 127.0.0.1:5432` | Postgres not running locally; test requires DB connection | High |
| 5 unhandled `ENOENT` on `/Users/macbook/.cashclaw/live-trades.jsonl` | Tests reference file paths that don't exist in the dev environment | High |
| Marketplace payout scheduler tests fail on `processed` value | Tests mock `createPayout` but scheduler logic changed during prior work | Medium |
| Billing notification tests had `pg.Pool` real connection (SASL abort) | F2 fix mocks `pg` now — confirms infra-dependent tests are the root cause | High |
| Audit wiring complete + 6/6 tests pass | Compliance work is sound; the new `src/shared/tenant/` module is a proper DRY extraction | High |
| 10 modified + 3 new files in working tree | Active multi-track work; risk of forgotten intermediate states | High |

## 4. Recommendation: Immediate Priority

**Triage test failures into buckets, then fix infrastructure-linked tests first.**

The project's own SDLC gates require 100% green tests before Deploy. 117 failures is not all regressions — it's a mix of:
1. Infrastructure gaps (no Postgres, missing `.cashclaw/` files) — ~30-40%
2. Pre-existing phase-35 regressions (market data, polymarket, strategy loader, signal fusion) — ~30%
3. Residual compliance-sprint impacts (audit hook type changes `string` → `TenantId`, referral route refactor breaking test mocks) — ~10-20%
4. Genuine logic bugs introduced in recent commits — ~10%

**Fix order:**
1. Infrastructure quick wins (mock Postgres, create `.cashclaw/` fixtures) — unblocks 30-40% of failures
2. Compliance-sprint residuals (update test mocks to match new `TenantId` brand, wire referral route to new `resolveTenant`) — unblocks another 10-20%
3. Phase-35 regressions — defer these unless they're load-bearing for the current sprint

## 5. Risk Assessment: Scattered Agent Runs with No Documentation

| Risk | Severity | Evidence |
|------|----------|----------|
| **Knowledge loss** — next session can't continue without re-running everything | High | No "What Worked / What's Left" docs; all knowledge is in agent run artifacts, not human-readable summaries |
| **Stale working tree** — partial changes committed while others sit uncommitted | Medium | `git status` shows 10 modified + 3 new tracked files; if any are committed piecemeal, others diverge |
| **False confidence in test state** — plan reports say "6/6 tests pass" but overall suite is 117 failures | High | `plans/260801-1142-compliance-remaining-work/plan.md` claims 6/6 pass, but that was the audit hooks scope only; overall suite is broken |
| **Code review gap** — compliance wiring passed review but with an open question about `tokenSubscriberId` identity format | Low-Medium | Code reviewer flagged: "is `claims?.sub` a displayable operator identity or an opaque ID?" — unresolved |
| **CI gate blockage** — can't promote to next phase with failing tests | High | CLAUDE.md: "Phase 3 hands to Phase 4 only after tests are 100% green and review ≥9.0/10" |

## 6. Next Action

Create a focused triage plan in `plans/` with:
1. A bucketed failure map (by root cause)
2. A fix sequence ordered by unblock value
3. A "What Worked / What's Left" block in `plans/260801-1142-compliance-remaining-work/plan.md` or a new plan dir

Then execute fixes 1-2 (infrastructure mocks + compliance residuals) and re-run tests to isolate remaining phase-35 regressions. Those should be tracked as a separate deferred bucket, not mixed into the current sprint's acceptance criteria.
