# Plan — CF Platform Finalize + Go-Live

**Date:** 2026-06-30 | **Status:** in_progress
**Mode:** --deep --parallel | **Desk compute:** User MacBook M1 Max (out of scope)

## Context

Platform Phase 2 4/5 complete. Dashboard builds clean. Worker deployed with payment infra.
User handles desk strategies on M1 Max. We finalize CF platform side.

## Phase Overview

| # | Phase | Priority | Est. | Deps |
|---|-------|----------|------|------|
| 01 | Deploy Dashboard to Production | P0 | 5min | None |
| 02 | Deploy Worker with Latest Code | P0 | 5min | None |
| 03 | CF Worker Cron Health Monitor | P1 | 20min | Phase 02 |
| 04 | Launch Content Final Polish | P1 | 15min | None |
| 05 | Verify + Commit | P0 | 10min | Phase 01-04 |

## Track Dependencies

```
Track A: Phase 01 (deploy dashboard) ──┐
Track B: Phase 02 (deploy worker) ──→ Phase 03 (cron health) ──→ Phase 05 (verify+commit)
Track C: Phase 04 (launch content) ───┘
```

## Files to Touch

| File | Action | Track |
|------|--------|-------|
| `src/platform/workers/edge-proxy.ts` | Maybe add cron handler | B |
| `wrangler.toml` | Add cron trigger config | B |
| Launch content markdown | Polish + finalize | C |

## Success Criteria

- [ ] Dashboard live at production URL
- [ ] Worker deployed with SHA verified
- [ ] Health cron runs every 5min, logs to KV
- [ ] Launch content copy-paste ready
- [ ] All tests pass, 0 type errors
- [ ] Git committed + pushed
