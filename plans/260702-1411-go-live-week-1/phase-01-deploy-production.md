---
phase: 1
title: "Deploy Production"
status: pending
priority: P1
effort: "~30min"
dependencies: []
---

# Phase 1: Deploy Production

## Overview

Deploy latest code to production: CF Worker + Dashboard. All quality gates run before deploy. Rollback plan: re-deploy previous working worker version.

## Prerequisites

- `CLOUDFLARE_API_TOKEN` set (confirmed available per go-live plan)
- Latest commit pushed to `main`
- Clean working tree (all changes committed)
- All 2,798 tests passing

## Related Code Files

- **Run:** `scripts/deploy-production.sh` — full deploy with quality gates
- **Read:** `src/platform/workers/edge-proxy.ts` — CF Worker source
- **Read:** `dashboard/package.json` — Dashboard build config
- **Read:** `wrangler.toml` — Worker deployment config

## Implementation Steps

1. **Pre-deploy check:** `pnpm typecheck && pnpm test && pnpm lint`
2. **Push latest:** `git push origin main` (ensure SHA matches deploy verification)
3. **Run deploy:** `bash scripts/deploy-production.sh`
4. **Verify SHA:** `curl -s https://algo-trader.example.com/api/version | grep -o '"shortSha":"[^"]*"' | cut -d'"' -f4` — must match local `git rev-parse HEAD | cut -c1-8`
5. **Verify HTTP:** `curl -sI https://algo-trader.example.com/api/health | head -1` — must return 200
6. **Dashboard deploy:** If dashboard has changes, deploy via CF Pages

## Rollback

```bash
# Revert worker to previous version
wrangler rollback
# Or re-deploy previous commit
git checkout <previous-sha> && bash scripts/deploy-production.sh && git checkout main
```

## Success Criteria

- [ ] Full deploy completes with exit code 0
- [ ] `/api/version` short SHA matches local commit
- [ ] HTTP 200 on production URL
- [ ] All 2,798 tests still pass (pre-deploy check)
