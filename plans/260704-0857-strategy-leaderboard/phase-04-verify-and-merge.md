---
phase: 4
title: "Verify and Merge"
status: pending
effort: "S (0.5 day)"
---

# Phase 4: Verify and Merge

## Overview

Full test suite + typecheck + lint. Merge to main, push.

## Implementation Steps

### Step 1: Test Suite
```bash
pnpm test && pnpm typecheck && pnpm lint
```

### Step 2: Deploy
```bash
git add -A && git commit -m "feat: Strategy Leaderboard - Next Wave VII"
git push origin main
```

### Step 3: Update Changelog
Add v3.9.0 entry for Strategy Leaderboard.

## Success Criteria
- [ ] All 2,916+ tests pass
- [ ] 0 TS errors, 0 lint errors
- [ ] Pushed to GitHub
- [ ] Changelog updated
