---
phase: 3
title: "Verify Revenue"
status: pending
effort: "S (1 day)"
tasks:
  - "task-065-payment-sync.md"
notes: "Blocked on first paying subscriber. Monitors signups, verifies payment flow end-to-end, documents first revenue. D1 query documentation fixed (psql→wrangler d1 query) — production uses Cloudflare D1, no psql access."
---

# Phase 3: Verify Revenue

## Overview

Track results from launch. Monitor signups, verify payment flow end-to-end, document first revenue.

## Task Tracking

| Task | Description | Status | Unblock Path |
|------|-------------|--------|--------------|
| #65 | First paying subscriber + revenue verification | 🔲 PENDING | Requires Phase 2 manual publish (#64) to drive conversions |

## Implementation Steps

### Step 1: Monitor Signups
```bash
# Query via Cloudflare D1 (production DB — no psql access)
# wrangler d1 query cashclaw-db --remote "SELECT COUNT(*) FROM users WHERE created_at > datetime('now', '-24 hours');"
# wrangler d1 query cashclaw-db --remote "SELECT tier, COUNT(*) FROM subscriptions GROUP BY tier;"
# wrangler d1 query cashclaw-db --remote "SELECT code, usage_count FROM referral_codes ORDER BY usage_count DESC LIMIT 10;"
```
**Note:** Production runs on Cloudflare D1 (`createServerClient()`, sync, no await). There is no `psql` shell access. Use `wrangler d1 query` against the bound D1 database for ad-hoc checks, or query through the app's existing auth/payment service layer in `src/platform/`.

### Step 2: Verify Payment Flow
Perform end-to-end test with real $1 transaction:
1. Create new FREE account
2. Upgrade to STARTER tier ($19/mo) via pricing page
3. Complete NOWPayments checkout (send $1 USDT/USDC)
4. Wait for IPN callback
5. Verify tier changes from FREE to STARTER in DB
6. Verify co-pilot API now returns full responses (not fallback)

### Step 3: Track Revenue
```bash
# Query via Cloudflare D1 (production DB — no psql access)
# wrangler d1 query cashclaw-db --remote "SELECT tier, COUNT(*), SUM(price) FROM subscriptions WHERE status = 'active' GROUP BY tier;"
# wrangler d1 query cashclaw-db --remote "SELECT COUNT(*) FROM referral_tracking WHERE converted_at IS NOT NULL;"
```

### Step 4: Document Learnings
Update `docs/project-changelog.md` with:
- v3.7.0 entry: GTM Execution complete
- First revenue amount
- Number of new signups
- Channel performance (which channel drove most signups)
- Issues encountered

### Step 5: Iterate
Based on data, determine next steps:
- If $0 revenue → debug payment flow, increase outreach
- If >$100 MRR → double down on best channel
- If >10 subscribers → focus on retention and upsell

## Related Files
- `docs/project-changelog.md`
- `src/platform/billing/nowpayments-service.ts`
- `src/platform/billing/subscription-service.ts`

## Success Criteria
- [ ] First $1 revenue from paying subscriber
- [ ] Payment flow verified end-to-end (FREE → STARTER)
- [ ] Launch metrics recorded (signups, tier distribution, channel performance)
- [ ] Changelog updated (v3.7.0)
- [ ] Data-driven next steps determined

## Risk Assessment
- **Zero conversions** — No one signs up. Mitigation: debug funnel, increase outreach, try paid ads
- **Payment flow breaks in production** — IPN callback not configured. Mitigation: verify NOWPayments dashboard settings
- **Low email engagement** — FREE users are inactive. Mitigation: segment by last login date
