---
title: "Revenue Readiness — Stop Building, Start Selling"
description: "5-track parallel execution to make algo-trader revenue-ready: fix pricing chaos + broken CI, wire subscriber pages, persist billing, add i18n, consolidate landing page + launch Discord."
status: in_progress
priority: P0
branch: main
tags: ["revenue", "pricing", "frontend", "billing", "i18n", "infra"]
blockedBy: []
blocks: []
created: "2026-07-03T11:41:00.000Z"
createdBy: "ck:orchestrator"
source: "workflow brainstorm"
brainstorm: "plans/reports/brainstorm-260703-1141-revenue-readiness-report.md"
---

# Revenue Readiness — Stop Building, Start Selling

## Overview

5 parallel tracks. All independent.

| Phase | Name | Status | Priority | Effort | Needs Stitch |
|-------|------|--------|----------|--------|-------------|
| 1 | [Unify Pricing + Fix CI](./phase-01-pricing-ci/plan.md) | Pending | P0 | M | No |
| 2 | [Wire Subscriber Pages](./phase-02-subscriber-pages/plan.md) | Pending | P0 | M | Yes |
| 3 | [Persist Billing to PostgreSQL](./phase-03-billing-persistence/plan.md) | Pending | P1 | L | No |
| 4 | [Add i18n (EN/VN)](./phase-04-i18n/plan.md) | Pending | P1 | M | No |
| 5 | [Consolidate Landing + Launch Discord](./phase-05-landing-community/plan.md) | Pending | P1 | S | Yes |

## Rationale

5 parallel audits revealed:
- **7 conflicting pricing schemes** across the codebase — billing charges one amount, analytics reports another, marketing shows a third
- **2 broken tests on main** — mock pollution in shared-db-contract.test.ts makes CI exit non-zero
- **3 subscriber pages built but no routes** — equity, P&L, trade-history UIs sit unreachable
- **Billing services use in-memory Maps** — all subscription/payment/drip state lost on restart
- **<5% i18n coverage** — trading, marketplace, landing pages are English-only
- **Zero community channels live** — all social accounts "not yet registered"

## Execution

Phases 1-5 run in parallel. Each phase has its own verify gate.

## Success Criteria

- [ ] All 7 pricing schemes unified to: PRO=$99/mo, ENTERPRISE=$299/mo, MASTER=$999/mo
- [ ] 2 failing tests fixed — `pnpm test` exits 0
- [ ] Subscriber pages (equity, P&L, trade-history) have routes + working backend APIs
- [ ] Billing records persisted to PostgreSQL (not in-memory)
- [ ] Trading, marketplace, and landing pages bilingual (EN/VN)
- [ ] Single landing page, Discord channel launched

## Reports

- [Brainstorm Report](../reports/brainstorm-260703-1141-revenue-readiness-report.md)
