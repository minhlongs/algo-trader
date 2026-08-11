---
phase: 2
title: "Publish Launch Content"
status: partial
blockers:
- "SendGrid env not configured (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME) — task #63"
manualStepsReady: true
tasks:
  - "task-063-sendgrid-config.md"
  - "task-064-manual-publish.md"
notes: "Email campaign script ready at scripts/send-email-campaign.ts — unblock by adding SendGrid env vars to .env (task #70). Manual publish content compiled in plans/reports/task-071-publish-content-ready-report.md (task #71). Blog live at api.cashclaw.cc via CF worker proxy (/api/blog/posts → data/blog/posts.json) — no extra deploy needed. Steps 2–5 ready-to-post, blocked by human-held social accounts. Domain references use api.cashclaw.cc."
effort: "S (2 days)"
---

# Phase 2: Publish Launch Content

## Overview

Publish all prepared launch content. Run email campaign to FREE users.

## Task Tracking

| Task | Description | Status | Unblock Path |
|------|-------------|--------|--------------|
| #63 | Configure SendGrid env vars | 🔴 BLOCKED | Add SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME to .env |
| #64 | Manual publish blog/reddit/twitter/discord | ✅ DONE (blog live) / 🔵 READY (social post) | Blog live; social steps ready-to-post, blocked by human-held accounts |

## Implementation Steps

### Step 1: Run Email Campaign (task #63 — BLOCKED)
```bash
cd /Users/macbook/algo-trader
pnpm exec tsx scripts/send-email-campaign.ts
```

What this does:
- Queries DB for FREE tier users: `SELECT email FROM subscriptions WHERE tier = 'FREE'`
- Sends bilingual EN/VN email announcing STARTER tier ($19/mo)
- Sends second email announcing AI Co-pilot
- 1.5s delay between sends to avoid rate limits

Verify:
- Check SendGrid dashboard for delivery stats
- Verify email received in test account

### Step 2: Publish Blog Post (task #64)
Use existing AutoMarketingDaemon or manual publish:
1. Read `docs/marketing/launch-blog-post.md`
2. Publish via blog endpoint or manual deploy
3. Title: "Introducing AI Co-pilot — Your Natural Language Trading Assistant"

### Step 3: Publish Reddit Post (task #64)
1. Read `docs/marketing/launch-reddit-post.md`
2. Go to https://reddit.com/r/algotrading
3. Submit new post with title and body from markdown file
4. Include link to api.cashclaw.cc

### Step 4: Publish Twitter/X Thread (task #64)
1. Read `docs/marketing/launch-twitter-thread.md`
2. Post 7-tweet thread on X/Twitter
3. Include screenshots of AI Co-pilot chat widget
4. Include pricing link to api.cashclaw.cc

### Step 5: Discord Announcement (task #64)
1. Read `docs/marketing/launch-discord-announcement.md`
2. Post in Polymarket Discord developer/trading channels
3. Offer FREE PRO tier to first 10 beta testers

## Related Files
- `docs/marketing/launch-blog-post.md`
- `docs/marketing/launch-reddit-post.md`
- `docs/marketing/launch-twitter-thread.md`
- `docs/marketing/launch-discord-announcement.md`
- `docs/marketing/email-campaign-starter-tier.md`
- `docs/marketing/email-campaign-co-pilot.md`
- `scripts/send-email-campaign.ts`

## Success Criteria
- [ ] Email campaign sent (check SendGrid) — **BLOCKED (task #63)**
- [ ] Blog post published at api.cashclaw.cc/blog — pending (task #64)
- [ ] Reddit post published on r/algotrading (link to api.cashclaw.cc) — pending (task #64)
- [ ] Twitter thread published (link to api.cashclaw.cc) — pending (task #64)
- [ ] Discord announcement posted (link to api.cashclaw.cc) — pending (task #64)
- [ ] All content uses correct links to api.cashclaw.cc

## Risk Assessment
- **Manual steps** — Reddit/Twitter/Discord publishing is manual. User must have accounts.
- **Reddit may flag as self-promotion** — Mitigation: use honest build-in-public narrative, engage in comments
- **Twitter thread requires screenshots** — Mitigation: take screenshots of co-pilot chat widget before posting
- **Email may bounce** — Mitigation: check SendGrid for bounce reports, remove invalid emails
