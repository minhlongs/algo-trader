---
phase: 2
title: "GTM Email Campaign"
status: pending
effort: "S (2 days)"
---

# Phase 2: GTM Email Campaign

## Overview

Send targeted email campaign to all FREE tier users announcing the new STARTER tier ($19/mo) and AI Co-pilot features. This activates the existing user base before public launch.

## Files

```
Modify:
├── src/platform/notifications/email-service.ts         — Add campaign template support
├── src/platform/api/routes/__tests__/
│   └── email-campaign.test.ts                          — Test campaign sending
└── docs/marketing/
    ├── email-campaign-starter-tier.md                  — NEW: Email content
    └── email-campaign-co-pilot.md                      — NEW: Email content
```

## Implementation Steps

### Step 1: Email Content — STARTER Tier Launch
Create `docs/marketing/email-campaign-starter-tier.md`:

Subject: "🚀 STARTER tier is here — $19/mo"
Body (bilingual EN/VN):
- Giới thiệu STARTER tier mới ($19/mo)
- What's included: 50 RPM, 5K daily API, 3 strategies, Polymarket + 1 CEX
- CTA: "Upgrade to STARTER →" link to pricing page
- Annual prepay option: save 20%, $182/year

### Step 2: Email Content — AI Co-pilot Preview
Create `docs/marketing/email-campaign-co-pilot.md`:

Subject: "🤖 AI Co-pilot — your trading assistant"
Body:
- "Ask your portfolio questions in plain English"
- Example queries: "what's my risk?", "find arb opportunities"
- PRO tier benefit — upgrade to access
- CTA: "Try AI Co-pilot →"

### Step 3: Send Emails
**NOTE:** `EmailService` does NOT support bulk campaign management (no segmentation, no batch send). It only has `send()` and `sendThresholdAlert()`.

Approach — manual simplified send:
1. Query DB for FREE tier users: `SELECT email FROM users WHERE tier = 'FREE'`
2. For each user, call `emailService.send(email, subject, body)` one at a time
3. Handle rate limits by adding setTimeout delays between sends
4. No click tracking — just verify delivery
5. Bilingual content: send EN or VN based on user's locale preference (check users.locale column if it exists)

Schedule: Day 4-5 (while Phase 1 is complete)

### Step 4: Test
- Send test email to admin account
- Verify links, formatting, bilingual content
- Verify unsubscribe link works
- Verify click tracking

## Related Files
- `docs/marketing/email-campaign-starter-tier.md`
- `docs/marketing/email-campaign-co-pilot.md`
- `src/platform/notifications/email-service.ts`

## Success Criteria
- [ ] Email content written (bilingual EN/VN)
- [ ] Test email sent and verified
- [ ] Campaign scheduled/triggered to all FREE users
- [ ] Click tracking working
- [ ] Unsubscribe link functional

## Risk Assessment
- **Low engagement** — FREE users may be inactive. Mitigation: segment by last login date, send to active+recent first
- **Bilingual formatting issues** — Mitigation: test both EN and VN versions before send
- **SendGrid rate limits** — Mitigation: batch sends, check SendGrid dashboard
