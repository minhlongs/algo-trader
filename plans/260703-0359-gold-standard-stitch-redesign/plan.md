---
title: Gold Standard — Full Stitch Redesign
description: >-
  Unify algo-trader RaaS platform design system. Phase 1 (token layer) then
  Phases 2-4 (landing, dashboard, Stitch) in parallel. One mega-phase, 4
  concurrent agents.
status: pending
priority: P1
branch: main
tags:
  - design-system
  - stitch
  - ui-ux-pro-max
  - frontend
  - retheme
  - parallel
blockedBy: []
blocks: []
created: '2026-07-03T04:00:00.000Z'
createdBy: 'ck:plan'
source: brainstorm
brainstorm: plans/reports/brainstorm-260703-0359-gold-standard-stitch-redesign-report.md
---

# Gold Standard — Full Stitch Redesign

## Overview

One mega-phase push to unify all algo-trader frontend surfaces (landing page + dashboard) under a shared gold design system. Phase 1 establishes the canonical design tokens. Phases 2-4 fan out in parallel to apply the retheme. Phase 5 verifies everything.

**Design system source:** ui-ux-pro-max search engine (67 styles, 161 palettes, 57 font pairings)
**Design intelligence:** `plans/reports/brainstorm-260703-0359-gold-standard-stitch-redesign-report.md`

### Design System

| Token | Value | Notes |
|-------|-------|-------|
| Primary | `#F59E0B` Gold | Trust, wealth, proven — landing already uses this |
| Secondary | `#8B5CF6` Purple | Tech, AI, replaces current dashboard cyan `#00C8E8` |
| Positive | `#34D399` Emerald | Profit, bull market |
| Negative | `#EF4444` Red | Loss, bear market |
| BG base | `#060912` | Unify all surfaces |
| Body font | Inter | Replaces Geist (dashboard) + DM Sans (landing) |
| Display font | Calistoga | Hero/headings, warm premium feel |
| Mono font | JetBrains Mono | Data/metrics (already in both) |

### Current Landscape

- **Landing page (cashclaw.cc):** Static HTML/CSS, CF Pages. Already gold-accented. 8 sections, 28 files. Fonts: Cabinet Grotesk + DM Sans.
- **Dashboard (Vite/React):** 16 pages, 60+ components, Tailwind. Cyan `#00C8E8` accent, Geist font. Stitch wrappers already seeded at `src/components/ui/stitch-*.tsx`.
- **No shared design tokens** between the two.

## Phases

| Phase | Name | Status | Priority | Deps |
|-------|------|--------|----------|------|
| 1 | [Token Layer](./phase-01-token-layer.md) | Pending | P1 | Completed |
| 2 | [Landing Retheme](./phase-02-landing-retheme.md) | Pending | P1 | Completed |
| 3 | [Dashboard Retheme](./phase-03-dashboard-retheme.md) | Pending | P1 | Completed |
| 4 | [Stitch Enhancement](./phase-04-stitch-enhancement.md) | Pending | P2 | Completed |
| 5 | [Verify & Merge](./phase-05-verify-merge.md) | Pending | P1 | 2,3,4 |

## Dependencies

```
Phase 1 (Token Layer) ──┬──→ Phase 2 (Landing Retheme) ──┐
                        ├──→ Phase 3 (Dashboard Retheme) ──┤
                        └──→ Phase 4 (Stitch Enhancement) ─┤
                                                            │
                                                       Phase 5 (Verify & Merge)
```

Phases 2, 3, 4 are independent and run in parallel after Phase 1. Phase 5 depends on all three.

**Cross-plan:** This plan overlaps with `plans/260703-0204-next-wave-II/` (Phase 5 touches dashboard pages). That plan is also pending. No mutual blocking — this plan is pure visual retheme, that plan adds functionality. If both execute concurrently, use git worktrees and merge the retheme first.

## Success Criteria

- [ ] `design-system/tokens.json` exists with all canonical values
- [ ] Dashboard `tailwind.config.ts`: accent `#F59E0B`, no remaining `#00C8E8`
- [ ] Landing page `tokens.css` references only canonical values
- [ ] `npm run build` passes in both landing and dashboard
- [ ] All Stitch components render with gold accent
- [ ] Zero cyan `#00C8E8` references remain in dashboard src
- [ ] Dashboard pages visually consistent: gold accents, purple for secondary
- [ ] Landing page deploys to CF Pages, health check passes
- [ ] NOWPayments checkout flow and coupon validation unbroken

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Font change (Geist→Inter) breaks layout | Text overflow | System-ui fallback, responsive testing |
| Missed cyan reference in edge component | Inconsistent | grep `#00C8E8` in final verification |
| Stitch MCP auth blocks mockups | No visual refs | Design spec is prompt-complete without Stitch |
| Plan 260703-0204 conflicts on dashboard files | Merge issues | Git worktree isolation + retheme merged first |
