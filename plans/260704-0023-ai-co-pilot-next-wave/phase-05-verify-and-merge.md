---
phase: 5
title: "Verify and Merge"
status: pending
effort: "S (1 day)"
---

# Phase 5: Verify and Merge

## Overview

Full verification after all 4 phases complete. Merge to main and deploy.

## Implementation Steps

### Step 1: Full Test Suite
```bash
pnpm test                    # All 2,855+ tests
pnpm typecheck               # 0 TS errors in src/
pnpm lint                    # 0 errors, <100 warnings
```

### Step 2: Manual Verification
- POST /api/v1/co-pilot/ask with each intent → verify response
- Dashboard chat: FAB click → panel opens → query → response with actions
- Telegram: /ask command works end-to-end
- Email campaign: verify send, links work

### Step 3: Protected Flow Verification
Verify no regressions in:
1. Setup Wizard (BYOK API key onboarding)
2. Telegram Bot (existing /campaign /status /results)
3. Payment Flow (NOWPayments IPN → tier activation)

### Step 4: Build Check
```bash
pnpm build                   # 0 errors
```

### Step 5: Documentation Sync
- Update `docs/development-roadmap.md` — mark Next Wave IV complete
- Update `docs/project-changelog.md` — add v3.6.0 entry
- Update `README.md` if new features merit mention

### Step 6: Commit
```bash
git add -A
git commit -m "feat: AI Co-pilot + GTM launch — Next Wave IV"
git push origin main
```

### Step 7: Post-Deploy Verification
- Verify /api/version shortSha matches local commit
- HTTP 200 on production URL
- Co-pilot API responds on production
- Telegram /ask works against production

## Success Criteria
- [ ] All tests pass (2,855+), 0 TS errors
- [ ] All 3 protected flows verified
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm build` — exit 0, 0 errors (NOTE: deploy:full does NOT exist in package.json; the deploy script is deploy:cf)
- [ ] Docs updated (roadmap, changelog)
- [ ] Co-pilot API verified in production
- [ ] Telegram /ask verified in production
