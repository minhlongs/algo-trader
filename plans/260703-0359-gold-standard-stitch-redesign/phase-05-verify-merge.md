---
phase: 5
title: "Verify & Merge"
status: pending
priority: P1
dependencies: [2, 3, 4]
---

# Phase 5: Verify & Merge

## Overview

Final verification gate after Phases 2-4 complete. Check for any remaining cyan references, build both projects, run tests, deploy landing page, and merge.

## Requirements

- Functional: Zero `#00C8E8` references remain in dashboard source
- Functional: Both projects build with 0 errors
- Functional: All dashboard tests pass
- Functional: Landing page deploys successfully
- Non-functional: Visual consistency across both surfaces

## Implementation Steps

### Step 1: Color audit

```bash
# Dashboard — should return 0 matches
grep -rn '#00C8E8' dashboard/src/
grep -rn '#00c8e8' dashboard/src/
grep -rn '00C8E8' dashboard/src/

# Landing — should show only if there's a reference (unlikely)
grep -rn '#00C8E8' landing/src/

# Verify gold is the dominant accent
grep -rn 'F59E0B\|#F59E0B' dashboard/tailwind.config.ts
```

### Step 2: Font audit

```bash
# Dashboard — should show Inter, not Geist
grep -rn 'Geist\|geist' dashboard/src/index.css
grep -rn 'Inter\|Calistoga' dashboard/src/index.css

# Landing — should show Inter + Calistoga
grep -rn 'DM Sans\|Cabinet Grotesk' landing/src/
```

### Step 3: Build verification

```bash
cd dashboard && npm run build
cd ../landing && # smoke test the landing page
```

### Step 4: Dashboard test run

```bash
cd dashboard && npm test
```

### Step 5: Landing deploy (CF Pages)

```bash
cd landing
./scripts/deploy-cf-pages.sh
```

Verify: `curl -s https://cashclaw.cc | grep -i 'calistoga\|Inter'`

### Step 6: Visual spot-check

Open in browser and verify:
- Landing page: gold accents, Calistoga headings, Inter body
- Dashboard: gold sidebar active state, gold section headers, purple badges/indicators
- Pricing page: gold-highlighted Pro plan card
- Mobile: both layouts responsive

### Step 7: Merge (if using worktree branches)

```bash
git checkout main
git merge --no-ff feature/gold-standard-stitch-redesign
git push origin main
```

## Success Criteria

- [ ] `grep -rn '#00C8E8' dashboard/src/` = 0 matches
- [ ] `grep -rn '#00c8E8' dashboard/src/` = 0 matches
- [ ] `cd dashboard && npm run build` = 0 errors
- [ ] `cd dashboard && npm test` = all pass
- [ ] Landing deploy exits 0
- [ ] Landing page health check passes
- [ ] Visual: gold accents visible on all dashboard pages
- [ ] Visual: purple secondary accent visible (badges, secondary CTAs)
- [ ] Visual: landing page uses Inter + Calistoga fonts

## Risk Assessment

- If grep finds residual `#00C8E8`, the color audit fails — each match must be investigated (some may be constants like `GLOW_COLOR` in config files, but most should be changed)
- If dashboard tests fail, they were likely unrelated — but check if any test hardcodes color references
- Landing deploy may have CDN cache — verify with `curl` not browser cache
