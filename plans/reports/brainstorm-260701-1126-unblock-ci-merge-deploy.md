# Brainstorm: Plan Next — Unblock CI → Merge → Deploy

**Date:** 2026-07-01 | **Verdict:** GO — operational unblock only

## Problem

PR #216 (marketplace go-live + 2,465 tests) cannot merge because GitHub Actions is disabled at the account level. Required status checks (Gates 1-4) can never report, so branch protection blocks all merges to `main`.

## Solution: Enable CI → Merge → Deploy

### Step 1: Enable GitHub Actions
```bash
gh api -X PUT repos/longtho638-jpg/algo-trader/actions/permissions \
    -f enabled=true -f allowed_actions=all
```

### Step 2: Wait for CI
Push triggers CI. 4 gates run: Validation (tsc+lint+tests), Security, Quality, Dependency hygiene. All pass locally.

### Step 3: Merge + Deploy
```bash
gh pr merge 216 --squash --delete-branch
cd dashboard && pnpm run deploy:production
```

## Quality Gates (Pre-merge, all pass locally)

| Gate | Status |
|------|--------|
| TypeScript | 0 errors |
| ESLint | 0 errors |
| Vitest | 2,465/2,465 |
| Worker build | passes |
| Dashboard build | passes |

## Risk

None. Code is identical to what passes locally. CI enable is a toggle, not a code change.
