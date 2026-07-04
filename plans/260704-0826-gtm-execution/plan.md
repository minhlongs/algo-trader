---
title: "GTM Execution — Next Wave V"
description: "Deploy production, publish launch content, run email campaign, first paying customer"
status: pending
priority: P1
branch: main
tags:
  - gtm
  - launch
  - deploy
  - revenue
blockedBy: []
blocks: []
created: "2026-07-04T08:26:00.000Z"
createdBy: "ck:brainstorm → ck:plan --deep --parallel"
source: brainstorm
brainstorm: plans/reports/brainstorm-260704-0826-gtm-execution-report.md
---

# GTM Execution — Next Wave V

## Overview

Last mile: deploy production, publish launch content (Reddit, Twitter, Discord, Blog), run email campaign, get first paying customer. Content đã viết sẵn — chỉ cần execute.

## Phases

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| 1 | [Deploy Production](./phase-01-deploy-production.md) | 1 day | Pending |
| 2 | [Publish Launch Content](./phase-02-publish-launch-content.md) | 2 days | Pending |
| 3 | [Verify Revenue](./phase-03-verify-revenue.md) | 1 day | Pending |

**Execution order:** Sequential (Phase 1 → Phase 2 → Phase 3).

## Success Criteria
- [ ] Production URL responds HTTP 200, SHA verified
- [ ] Co-pilot API (`POST /api/v1/co-pilot/ask`) works in production
- [ ] Telegram `/ask` responds against production
- [ ] Email campaign sent to all FREE users
- [ ] Launch content published on 3+ channels
- [ ] First $1 revenue from paying subscriber
- [ ] 2,916+ tests, 0 regressions

## Key Files
- Brainstorm: `plans/reports/brainstorm-260704-0826-gtm-execution-report.md`
- Docs: `docs/development-roadmap.md`, `docs/project-changelog.md`
- Marketing: `docs/marketing/launch-*.md` (4 files ready)
- Email: `scripts/send-email-campaign.ts`
