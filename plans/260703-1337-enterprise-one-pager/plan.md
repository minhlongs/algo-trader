---
title: "Enterprise Consolidation + Investor One-Pager"
description: "Scope: enterprise page consolidation (pricing+contact→1 route) + investor one-pager full rewrite"
status: pending
priority: P1
branch: main
tags:
  - frontend
  - enterprise
  - fundraising
blockedBy: []
blocks: []
created: "2026-07-03T13:37:00.000Z"
createdBy: "ck:plan"
source: skill
brainstorm: plans/reports/brainstorm-260703-1337-next-wave-report.md
---

# Enterprise Consolidation + Investor One-Pager

## Overview

2 independent parallel tracks:
- **Track B**: Consolidate 4 enterprise pages (668 lines) → one `/enterprise` route with pricing + contact tabs
- **Track D**: Full rewrite of investor one-pager (~250 lines) with growth trajectory, unit economics, competitive landscape

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Scout & Verify](./phase-01-scout-verify.md) | Pending | S |
| 2 | [Enterprise Consolidation](./phase-02-enterprise-consolidation.md) | Pending | S |
| 3 | [Investor One-Pager Rewrite](./phase-03-investor-one-pager-rewrite.md) | Pending | S |
| 4 | [Fix Enterprise Backend](./phase-04-fix-enterprise-backend.md) | Pending | S |
| 5 | [Verify & Merge](./phase-05-verify-merge.md) | Pending | S |

Phases 1→(2+4)→5 sequential. Phase 3 runs parallel to everything (markdown only, no code changes).

## Success Criteria

- [ ] `/enterprise` route renders pricing (PRO $99 / ENTERPRISE $299 / MASTER $999) with contact form
- [ ] Enterprise thank-you page removed, redirected to generic success
- [ ] enterprise-plan.ts pricing constants match canonical values
- [ ] TAM dashboard archived (not deleted)
- [ ] `npm run build` passes with 0 errors
- [ ] Investor one-pager: 250+ lines, growth trajectory, competitive landscape, unit economics
