---
phase: 5
title: "Verify & Merge"
status: pending
effort: S
---

# Phase 5: Verify & Merge

## Overview
Final verification of all changes across all 4 tracks.

## Implementation Steps
1. `npx tsc --noEmit` — 0 errors
2. `npx vitest run` — all tests pass
3. Manual verification: Discord server accessible, Telegram responds
4. Manual: landing page shows bilingual toggle
5. Verify no regressions on subscriber pages

## Success Criteria
- [ ] TypeScript: 0 errors
- [ ] Tests: 2,790+ passing
- [ ] Discord + Telegram + Twitter all live
- [ ] i18n active on 5+ pages
- [ ] Billing tests pass
- [ ] Infra baseline documented
