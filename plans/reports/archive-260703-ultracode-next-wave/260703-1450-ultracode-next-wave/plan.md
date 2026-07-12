---
title: "Ultracode Next Wave — GTM + i18n + Billing + Infra"
description: "4 independent parallel tracks: go-to-market, full i18n, billing persistence phase 2, infrastructure hardening"
status: pending
priority: P0
branch: main
tags:
  - gtm
  - i18n
  - billing
  - infra
  - parallel
blockedBy: []
blocks: []
created: "2026-07-03T14:50:00.000Z"
createdBy: "ck:plan"
source: skill
brainstorm: plans/reports/brainstorm-260703-1450-ultracode-next-wave-report.md
---

# Ultracode Next Wave — GTM + i18n + Billing + Infra

## Overview

4 independent parallel tracks. All fully independent — no shared file conflicts.

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Go-to-Market](./phase-01-go-to-market.md) | Pending | M |
| 2 | [Full i18n Expansion](./phase-02-full-i18n-expansion.md) | Pending | M |
| 3 | [Billing Persistence Phase 2](./phase-03-billing-persistence-phase-2.md) | Pending | L |
| 4 | [Infrastructure Hardening](./phase-04-infrastructure-hardening.md) | Pending | S |
| 5 | [Verify & Merge](./phase-05-verify-merge.md) | Pending | S |

Phases 1-4 run in parallel. Phase 5 runs after all four are complete.

## Success Criteria
- [ ] Discord server live with announcement posted
- [ ] Telegram bot responds to /campaign /status /results
- [ ] Twitter/X handle created, first blog post published
- [ ] 31 pages bilingual EN/VN, dual i18n library consolidated
- [ ] 6 PostgreSQL migrations + 6 service refactors (phase 2 billing)
- [ ] k6 load test baseline with auth headers
