---
phase: 6
title: "Pre-Flight Check"
status: pending
priority: P1
effort: "~15min"
dependencies: []
---

# Phase 6: Pre-Flight Check

## Overview

Run all quality gates before the first production deploy. This is the PREREQUISITE for all other phases — run before Phase 1.

## Implementation Steps

1. **Full test suite:** `pnpm test` — 2,798 must pass
2. **TypeScript check:** `pnpm typecheck` — 0 errors
3. **Lint check:** `pnpm lint` — 0 errors, <100 warnings
4. **Build check:** `pnpm build` — 0 errors
5. **Deploy script dry-run:** Review `scripts/deploy-production.sh` for correctness
6. **Env vars check:** Verify all required env vars are documented in `.env.example`:
   - `CLOUDFLARE_API_TOKEN` — for wrangler deploy
   - `NOWPAYMENTS_IPN_SECRET` — for IPN verification
   - `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_PASSPHRASE`, `POLYMARKET_PRIVATE_KEY` — for live trading
7. **Git check:** `git status` — clean working tree (all changes committed)

## Success Criteria

- [ ] 2,798 tests pass
- [ ] 0 TypeScript errors
- [ ] 0 lint errors, <100 warnings
- [ ] Build succeeds
- [ ] Required env vars documented
- [ ] Working tree clean
- [ ] `git push origin main` succeeds (latest commit pushed)
