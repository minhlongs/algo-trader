# Phase D: Customer Activation

**Effort:** M (2-4 weeks)
**Parallel-safe:** Yes (files isolated from other tracks — UI/i18n/Telegram scope)
**Impact:** High — removes barriers preventing the first 10 paying subscribers

## Context

From the brainstorm: *"31 dashboard pages remain English-only in a market where 40%+ of crypto traders are Vietnamese. Telegram bot responds with placeholder data. Referral program is half-built."* This track removes the activation blockers and acquires the first subscribers.

## Files to Modify

```
src/platform/
├── telegram/
│   ├── bot.ts                       — Wire /campaign /status /results to live data
│   ├── campaign-handler.ts          — NEW: real campaign data
│   ├── status-handler.ts            — NEW: real status data
│   ├── results-handler.ts           — NEW: real results data
│   └── user-session-store.ts        — Migrate from Map to PostgreSQL (TODO)
├── referral/
│   ├── referral-service.ts          — Add code generation on signup
│   ├── referral-routes.ts           — Wire code generation endpoint
│   └── referral-code-generator.ts   — NEW: unique code generation
├── landing/
│   ├── public/
│   │   ├── index.html               — Add locale selector
│   │   ├── pricing.html             — i18n
│   │   ├── signup.html              — i18n + referral code field
│   │   └── login.html               — i18n
│   └── locales/
│       ├── en/
│       │   └── common.json          — All UI strings
│       └── vi/
│           └── common.json          — Vietnamese translations
dashboard/
├── src/
│   ├── i18n/
│   │   ├── i18n.ts                  — Standardize on react-i18next
│   │   └── locales/
│   │       ├── en.json              — Default locale
│   │       └── vi.json              — Vietnamese locale
│   ├── pages/
│   │   ├── settings-page.tsx        — i18n
│   │   ├── account-page.tsx         — i18n
│   │   ├── login-page.tsx           — i18n
│   │   ├── signup-page.tsx          — i18n + referral code
│   │   ├── pricing-page.tsx         — i18n
│   │   └── ... (27 more pages)      — i18n
│   └── components/
│       ├── locale-selector.tsx      — NEW: language switcher
│       └── referral-code-input.tsx  — NEW: code input on signup
src/shared/
├── db/
│   └── migrations/
│       └── 052-referral-codes.sql   — NEW: referral codes table
├── types/
│   └── referral.ts                  — Shared types
docs/marketing/
├── launch-twitter-thread.md         — Content ready (verify)
├── launch-blog-post.md              — Content ready (verify)
├── launch-reddit-post.md            — NEW: Reddit r/algotrading post
└── launch-discord-announcement.md   — Content ready (verify)
```

## Implementation Steps

### Step 1: Complete i18n for 31 Dashboard Pages (Days 1-8)
**Priority: P1 — Vietnamese crypto traders are 40%+ of addressable market.**

1. **Audit current state**:
   - List all 46 dashboard pages
   - Mark which are already bilingual (~15) and which need translation (~31)
   - Check if react-intl pages remain (from i18n consolidation note)

2. **Consolidate i18n libraries** (if dual libraries still exist):
   - Migrate remaining react-intl pages to react-i18next
   - Remove react-intl dependency

3. **Translate high-traffic pages first** (Days 1-3):
   - pricing, signup, login, settings, account — ~100 keys total
   - These are the conversion-critical pages

4. **Translate remaining pages** (Days 4-8):
   - Batch remaining 26 pages by component type
   - Create `dashboard/src/i18n/locales/vi.json` with all strings
   - Add `locale-selector.tsx` component (language switcher in header)

5. **API response i18n** — add `Accept-Language` header support to critical endpoints:
   - Error messages
   - Dashboard strings
   - Email notifications

### Step 2: Launch Telegram Bot with Live Data (Days 5-7)
*(Can start parallel with Day 3 of Step 1)*

1. Read `src/platform/telegram/bot.ts` — understand current placeholder implementation
2. Read Telegram bot setup — verify webhook URL is configured
3. Create handlers:
   ```typescript
   // /campaign — Show active trading campaigns
   bot.command('campaign', async (ctx) => {
     const campaigns = await getActiveCampaigns(ctx.from.id)
     await ctx.reply(formatCampaigns(campaigns))
   })
   
   // /status — Show portfolio status and P&L
   bot.command('status', async (ctx) => {
     const status = await getSubscriberStatus(ctx.from.id)
     await ctx.reply(formatStatus(status))
   })
   
   // /results — Show recent trade results
   bot.command('results', async (ctx) => {
     const results = await getRecentResults(ctx.from.id)
     await ctx.reply(formatResults(results))
   })
   ```
4. Wire to live subscriber data via existing services
5. Test each command with a test subscriber account
6. **Address TODO**: Migrate `userSessions` from in-memory Map to PostgreSQL
   - Requires migration and session table
   - Allows bot to survive restarts without losing subscriber state

### Step 3: Wire Referral Program into Signup Flow (Days 8-10)
1. Read `src/platform/referral/referral-service.ts` — understand current state
2. Read referral routes — verify code generation endpoint exists
3. Create `referral-code-generator.ts`:
   ```typescript
   function generateReferralCode(userId: string): string {
     const prefix = 'ALGO'
     const shortId = userId.slice(0, 6).toUpperCase()
     const checksum = crc8(prefix + shortId)
     return `${prefix}-${shortId}-${checksum}`
   }
   ```
4. Add `POST /api/v1/referral/generate-code` endpoint
5. Wire code generation to signup flow:
   - Signup form includes optional referral code field
   - On submission, valid referral code links new user to referrer
6. Add `052-referral-codes.sql` migration:
   ```sql
   CREATE TABLE referral_codes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     code VARCHAR(20) UNIQUE NOT NULL,
     owner_id UUID NOT NULL REFERENCES users(id),
     created_at TIMESTAMP DEFAULT NOW(),
     usage_count INTEGER DEFAULT 0,
     max_uses INTEGER DEFAULT 100
   );
   ```
7. Add conversion tracking: when referral code used → reward referrer (free month, tier upgrade)

### Step 4: Publish Launch Content on 2+ Channels (Days 10-14)
*(Depends on Track B Step 3 — backtest data for credible content)*

1. **X (Twitter) Thread** — 7-tweet thread:
   - Tweet 1: The thesis — one human vs the markets
   - Tweet 2-4: Results — backtest performance data (waiting for Track B)
   - Tweet 5: Feature highlight — AI-powered trading
   - Tweet 6: Pricing — from FREE to MASTER ($999/mo)
   - Tweet 7: CTA — link to quant.cashclaw.cc

2. **Reddit r/algotrading post**:
   - Title: "I built a solo quant desk — 52 strategies, 2,798 tests, $0 revenue. Here's what I learned."
   - Content: Honest build-in-public narrative with backtest data
   - Include link to quant.cashclaw.cc

3. **Polymarket Discord**:
   - Share in the developer/trading channels
   - Focus on Polymarket-specific strategies
   - Offer free PRO tier to first 10 beta testers

4. **Blog post** on the existing blog:
   - Title: "From Solo to $1M ARR — Building a Quant Desk with AI"
   - Repurpose manifesto + backtest data
   - Publish via existing AutoMarketingDaemon

## Related Files
- `src/platform/telegram/bot.ts`
- `src/platform/telegram/campaign-handler.ts`
- `src/platform/telegram/status-handler.ts`
- `src/platform/telegram/results-handler.ts`
- `src/platform/referral/referral-service.ts`
- `src/platform/referral/referral-routes.ts`
- `src/platform/landing/public/index.html`
- `dashboard/src/i18n/`
- `dashboard/src/pages/` (31 pages)
- `dashboard/src/components/locale-selector.tsx`
- `dashboard/src/components/referral-code-input.tsx`
- `docs/marketing/`
- `src/shared/db/migrations/052-referral-codes.sql`

## Todo List
- [ ] Audit and list all 46 dashboard pages by i18n status
- [ ] Consolidate dual i18n libraries (react-i18next only)
- [ ] Translate 31 dashboard pages to Vietnamese
- [ ] Add locale selector to dashboard header
- [ ] Wire Telegram /campaign /status /results to live data
- [ ] Migrate Telegram user sessions from Map to PostgreSQL
- [ ] Create referral code generator
- [ ] Wire referral code input on signup form
- [ ] Add conversion tracking for referrals
- [ ] Write and publish X thread (7 tweets)
- [ ] Write and publish Reddit r/algotrading post
- [ ] Share in Polymarket Discord
- [ ] Publish blog post via existing blog infrastructure

## Success Criteria
- [ ] 31 dashboard pages fully bilingual (EN/VN) with locale selector working
- [ ] Telegram bot responding correctly to /campaign /status /results with live data
- [ ] Referral code generation working end-to-end on signup
- [ ] Launch content published on at least 2 channels
- [ ] 10 active paid subscribers (non-FREE tier, >7 days since signup)
- [ ] No regressions in Setup Wizard or Payment Flow

## Risk Assessment
- **i18n for 31 pages reveals untranslated strings in API responses**: Fix backend strings as they surface. Separate i18n audit pass after page translations.
- **Telegram webhook URL changes on each deployment**: Add webhook registration to deploy script if needed. Document the requirement.
- **Referral program was "half-built" — there may be broken routes**: Test end-to-end before launch. Expect and fix bugs.
- **Launch content depends on backtest performance data (Track B)**: If Track B isn't ready, publish without specific numbers. Focus on the solo quant thesis.
- **Discord/Twitter account creation involves manual steps outside code control**: Start account setup process Day 1.
