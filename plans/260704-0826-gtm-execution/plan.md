---
title: "GTM Execution — Next Wave V"
description: "Deploy production, publish launch content, run email campaign, first paying customer"
status: in_progress
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
| 1 | [Deploy Production](./phase-01-deploy-production.md) | 1 day | ✅ Complete<br/>SHA: a200991f<br/>URL: https://api.cashclaw.cc<br/>Deployed: 2026-08-04 |
| 2 | [Publish Launch Content](./phase-02-publish-launch-content.md) | 2 days | ⚠️ Blocked<br/>Email: SendGrid env vars missing<br/>Manual: blog/reddit/twitter/discord ready<br/>Domain: api.cashclaw.cc |
| 3 | [Verify Revenue](./phase-03-verify-revenue.md) | 1 day | 🔲 Pending<br/>Waiting on paying subscriber |

**Execution order:** Sequential (Phase 1 → Phase 2 → Phase 3).

## Recent Fixes (2026-08-04)
- **BLOCKER A**: Email campaign links migrated `app.algotrader.cc` → `api.cashclaw.cc` (7 links in script + 8 in test file)
- **WARNING B**: Phase 2 Step 1 command corrected `npx ts-node` → `pnpm exec tsx`

## Success Criteria
- [x] Production URL responds HTTP 200, SHA verified ✅ (SHA a200991f — https://api.cashclaw.cc)
- [x] Co-pilot API (`POST /api/v1/co-pilot/ask`) works in production ✅
- [x] Telegram `/ask` responds against production ✅
- [ ] Email campaign sent to all FREE users ❌ (blocked — SendGrid env not configured)
- [ ] Launch content published on 3+ channels ⚠️ (manual ready at docs/marketing/ — blog/reddit/twitter/discord)
- [ ] First $1 revenue from paying subscriber ❌ (pending — blocked on Phase 2 execution + paying user)
- [x] 2,916+ tests, 0 regressions ✅

## Phase Outputs
- Phase 1: deployedAt=2026-08-04, deployedSha=a200991f, productionUrl=https://api.cashclaw.cc, httpStatus=200
- Phase 2: manualStepsReady (blog/reddit/twitter/discord), blocker=SendGrid env vars
- Phase 3: status=pending, dependency=first paying subscriber

## Key Files
- Brainstorm: `plans/reports/brainstorm-260704-0826-gtm-execution-report.md`
- Docs: `docs/development-roadmap.md`, `docs/project-changelog.md`
- Marketing: `docs/marketing/launch-*.md` (4 files ready)
- Email: `scripts/send-email-campaign.ts`
