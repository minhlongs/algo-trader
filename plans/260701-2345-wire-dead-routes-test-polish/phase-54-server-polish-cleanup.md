# Phase 54: Server Polish & Cleanup

**Priority:** MEDIUM | **Status:** complete | **Depends On:** — | **Estimated:** 1h

## Overview

Fix broken npm scripts, remove stale artifacts. No feature changes — operational cleanup.

## Broken Scripts to Fix

In `package.json`, 7 scripts reference files that no longer exist after the desk/platform separation.

| Script | Old Target | Fix |
|--------|-----------|-----|
| `sop:run` | `src/agi-sops/index.js` | **Remove** — directory removed |
| `sop:dev` | `src/agi-sops/index.js` | **Remove** — same |
| `disk:check` | `scripts/disk-monitor.ts` | **Remove** — file doesn't exist |
| `sync-dunning-kv` | `src/jobs/dunning-kv-sync.ts` | **Remove** — file doesn't exist |
| `audit` | `src/audit/index.ts` | **Remove** — directory removed |
| `chaos-test` | `src/testing/chaos/index.ts` | **Remove** — directory removed |
| `build:cached` | `scripts/build-with-cache.sh` | **Remove** — file doesn't exist |

Related scripts (`cache:check`, `cache:restore`, `cache:save`, `cache:cleanup`) were part of the `build:cached` pipeline — remove all 4.

## Stale Artifacts

| File | Action |
|------|--------|
| `src/platform/api/routes/admin-dna-routes.ts.bak` | **Delete** — pre-separation backup with stale import paths |

## Implementation Steps

### Step 1: Verify no CI references
```bash
grep -r "sop:run\|sop:dev\|disk:check\|sync-dunning-kv\|audit\|chaos-test\|build:cached\|cache:check\|cache:restore\|cache:save\|cache:cleanup" .github/ || echo "No CI references — safe to remove"
```

### Step 2: Remove broken scripts from package.json
Remove the 7 broken scripts + 4 cache scripts (11 total). Use Edit tool for surgical removal.

### Step 3: Delete .bak file
```bash
rm src/platform/api/routes/admin-dna-routes.ts.bak
```

### Step 4: Verify
- `pnpm build` — 0 errors
- `pnpm test` — 2,712 pass
- `node -e "require('./package.json').scripts" | grep -c "sop:run\|disk:check\|audit"` — returns 0

## Touchpoints
- **Modify:** `package.json` (scripts section only)
- **Delete:** `src/platform/api/routes/admin-dna-routes.ts.bak`

## Success Criteria
- [ ] 11 broken scripts removed from package.json
- [ ] `.bak` file deleted
- [ ] No CI files reference removed scripts
- [ ] `pnpm build` + `pnpm test` pass
