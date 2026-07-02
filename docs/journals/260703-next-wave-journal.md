# Next Wave — 4-Track Parallel Implementation

**Date:** 2026-07-03
**Duration:** ~69 min (workflow) + ~15 min (merge, review, fix)
**Status:** Resolved

## What

Shipped the "Next Wave" — the final big feature push targeting $1M ARR. Four parallel tracks across git worktrees, 10 agents, 730 tool calls.

## Key Decisions

- **Git worktrees for isolation**: 4 worktrees (revenue, trading, infra, platform) so devs never stepped on each other's files during implementation. This saved hours of coordination overhead.
- **Central merge session**: Rejected auto-merge. Single person resolved all conflicts in one pass. Necessary because `server.ts` had mutually-destructive edits between Revenue (new pricing routes) and Platform (self-service API key routes).
- **MASTER as enum value 3 (highest)**: `LicenseTier.MASTER = 3`, above ENTERPRISE=2. The getTierLevel() bug (see below) proves this ordering is non-obvious in switch statements. Worth adding a comment next time.

## Issues Found & Fixed

- **CRITICAL — getTierLevel() treated MASTER as FREE**: `validators.ts` had MASTER as default (return 0) in the pre-merge version. Caused MASTER-tier users to be denied all gated features. Fixed in merge review by adding `case LicenseTier.MASTER: return 3`.
- **Missing env var**: `NOWPAYMENTS_INVOICE_MASTER` was absent from `.env.example` — would break MASTER tier payment activation in production. Caught by code review, added.
- **Churn tracking gap**: `churnByTier` initializer lacked `LicenseTier.MASTER` — the key existed but returned `undefined` (coerced to 0 by `?? 0`, so silent, not crashing). Fixed by adding MASTER to the init object.

## Stats

| Metric | Value |
|--------|-------|
| Files changed | 96 (`+4246/-118`) |
| Commits | 5 |
| Tests passing | 2,798 (243 files) |
| TS errors | 0 |
| Agents used | 10 (4 implementers + 4 reviewers + 1 docs + 1 merge) |
| Worktrees | 4 |
| Merge conflicts | 1 critical (`server.ts`) |

## Lessons Learned

- **getTierLevel() risk**: Adding a new tier requires updating 3 places — the enum, the switch in getTierLevel(), and the churn init map. A lint rule or `no-default` switch-case would catch this. Worth a missed-branch lint config next tier addition.
- **Parallel worktree wins**: Zero file contention during development. The only conflict was the shared entry point (`server.ts`), which could be prevented by routing it through a plugin/route-registration pattern instead of flat imports.
- **Code review caught the critical bug**, not tests. The test for getTierLevel() covered FREE/PRO/ENTERPRISE only. Lesson: when adding a tier, add the test first.
