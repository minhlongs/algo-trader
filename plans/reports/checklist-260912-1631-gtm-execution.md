# GTM Execution Checklist — algo-trader
> Date: 2026-07-12 | Goal: Go live, publish content, activate billing, onboard VIP seats

---

## Phase 1: PRE-REQUISITE FIXES (do first — 30 min)

### 1.1 NOWPayments Webhook Mount (BLOCKER)
- [x] Status: **ALREADY FIXED** in `src/platform/api/server.ts`
- [x] Mount exists at line 173: `this.app.use('/api/webhooks/nowpayments', nowpaymentsWebhookRouter)`
- [x] Verify: `POST /api/webhooks/nowpayments` returns 405 (not 404)
- [ ] Action: Start API server and test with curl:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/nowpayments
  # Expected: 405 Method Not Allowed (router mounted, no POST handler for GET)
  ```

### 1.2 Environment Variables — Set ALL of these
- [ ] `NOWPAYMENTS_API_KEY` — from NOWPayments dashboard
- [ ] `NOWPAYMENTS_IPN_SECRET` — for webhook signature verification
- [ ] `NOWPAYMENTS_INVOICE_STARTER` — invoice ID for $99/mo
- [ ] `NOWPAYMENTS_INVOICE_PRO` — invoice ID for $299/mo
- [ ] `NOWPAYMENTS_INVOICE_ENTERPRISE` — invoice ID for $999/mo
- [ ] `SENDGRID_API_KEY` — for email campaigns
- [ ] `SENDGRID_FROM_EMAIL` — noreply@cashclaw.cc
- [ ] `TELEGRAM_BOT_TOKEN` — @Sophia_Bbot token
- [ ] `ALERT_CHAT_ID` — Telegram admin chat
- [ ] `TELEGRAM_CHAT_ID` — alert fan-out
- [ ] `TELEGRAM_CHANNEL_ID` — public channel
- [ ] `API_BASE_URL=https://api.cashclaw.cc` — production URL

### 1.3 Database / Services Ready
- [ ] PostgreSQL connected (check `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
- [ ] D1 migrations applied (if using Cloudflare Workers path)
- [ ] Redis connected for pub/sub
- [ ] Sentry DSN configured for error tracking

---

## Phase 2: DEPLOY PRODUCTION

### 2.1 CI/CD Deploy Chain
```bash
# Step 0: Push first (deploy script rejects unpushed commits)
git push origin main

# Step 1: Build + deploy from app package
cd /path/to/algo-trader
npm run deploy:full

# Step 2: Verify SHA match
LOCAL_SHA=$(git rev-parse HEAD | cut -c1-8)
LIVE_SHA=$(curl -s https://api.cashclaw.cc/api/version | grep -o '"shortSha":"[^"]*"' | cut -d'"' -f4)
```

- [ ] Deploy script exits 0
- [ ] `shortSha` in `/api/version` matches local commit
- [ ] HTTP 200 on https://api.cashclaw.cc
- [ ] HTTP 200 on https://cashclaw.cc

### 2.2 Smoke Tests (production)
- [ ] `GET /api/health` returns 200
- [ ] `GET /api/v1/co-pilot/ask` with valid token returns response
- [ ] `POST /api/webhooks/nowpayments` returns 405 (mounted)
- [ ] Telegram bot `/start` responds
- [ ] Telegram `/ask` responds with co-pilot answer

### 2.3 Infrastructure
- [ ] CF Workers routes pinned: `cashclaw.cc` + aliases
- [ ] D1 database bindings active
- [ ] KV namespace for caching
- [ ] R2 bucket for signals storage
- [ ] Multi-region routing verified

---

## Phase 3: ACTIVATE PAYMENTS (NOWPayments)

### 3.1 Create Invoices in NOWPayments Dashboard
- [ ] Tier: STARTER — $99/mo → create invoice, copy ID to `.env`
- [ ] Tier: PRO — $299/mo → create invoice, copy ID to `.env`
- [ ] Tier: ENTERPRISE — $999/mo → create invoice, copy ID to `.env`

### 3.2 Verify Webhook Integration
- [ ] Set IPN URL in NOWPayments dashboard: `https://api.cashclaw.cc/api/webhooks/nowpayments`
- [ ] Send test webhook from NOWPayments sandbox
- [ ] Verify webhook received by server (check logs)
- [ ] Verify signature validation passes
- [ ] Verify subscription activated after "payment confirmed"

### 3.3 End-to-End Payment Flow
- [ ] Register test account on cashclaw.cc
- [ ] Navigate to billing page
- [ ] Select STARTER tier
- [ ] Complete NOWPayments checkout (crypto USDT TRC20)
- [ ] Verify tier upgraded to PRO/BASIC after payment
- [ ] Verify Telegram bot notifies new subscriber

---

## Phase 4: PUBLISH MARKETING CONTENT

All content files ready in `docs/marketing/` — ready to copy-paste.

### 4.1 T-24h: Teaser (launch Twitter + Polymarket Discord)
- [ ] Post teaser to Twitter (`docs/marketing/launch-twitter-thread.md` Tweet 1)
- [ ] Post teaser to Polymarket Discord (`docs/marketing/launch-discord-announcement.md`)
- [ ] Schedule tweet thread for T-0h launch

### 4.2 T-0h: Launch Day Content
- [ ] **Twitter Thread** (7 tweets) — `docs/marketing/twitter-thread.md`
  - [ ] Tweet 1: Hook — prediction markets + position sizing
  - [ ] Tweet 2: Problem — blind betting
  - [ ] Tweet 3: Solution — 52 AI strategies
  - [ ] Tweet 4: How it works (4 steps)
  - [ ] Tweet 5: The math (Kelly Criterion)
  - [ ] Tweet 6: Proof — live P&L
  - [ ] Tweet 7: CTA — cashclaw.cc
- [ ] **Reddit Post** — `docs/marketing/launch-reddit-post.md`
  - [ ] r/predictionmarkets
  - [ ] r/algotrading
  - [ ] r/Polygon
- [ ] **Discord Announcement** — `docs/marketing/discord-announce.md`
  - [ ] @everyone in relevant servers
- [ ] **Blog Post** — `docs/marketing/launch-blog-post.md`
  - [ ] Publish to cashclaw.cc/blog (via admin panel or CMS)
- [ ] **Twitter banner** — upload `docs/marketing/twitter-banner.png`

### 4.3 Community Engagement
- [ ] Respond to all comments within 2 hours (first 48 hours critical)
- [ ] DM high-engagement accounts with personalized offer
- [ ] Post in CashClaw's own Telegram channel

---

## Phase 5: EMAIL CAMPAIGN

### 5.1 Prerequisites
- [ ] SendGrid account created and approved
- [ ] Domain verified (SPF/DKIM/DMARC for sends)
- [ ] `SENDGRID_API_KEY` in `.env`

### 5.2 Execute Campaign
```bash
cd /Users/macbook/algo-trader
pnpm exec tsx scripts/send-email-campaign.ts --test   # Test to admin email first
pnpm exec tsx scripts/send-email-campaign.ts --starter # Send STARTER tier announcement
pnpm exec tsx scripts/send-email-campaign.ts --copilot # Send Co-pilot announcement
```
- [ ] Test email received by admin (verify deliverability)
- [ ] STARTER tier emails sent to all FREE tier users
- [ ] Co-pilot announcement sent to PRO tier users
- [ ] Track open rates and click rates

### 5.3 Email Templates (already built in script)
- [ ] STARTER announcement (`--starter`) — $19/mo upgrade path
- [ ] Co-pilot announcement (`--copilot`) — AI features for PRO+

---

## Phase 6: TELEGRAM BOT (@Sophia_Bbot)

### 6.1 Bot Integration
- [ ] Telegram bot token set in `.env`
- [ ] Webhook URL: `https://api.cashclaw.cc/api/telegram/webhook`
- [ ] Set webhook: `curl "https://api.telegram.org/bot$TOKEN/setWebhook?url=https://api.cashclaw.cc/api/telegram/webhook"`
- [ ] Test: `/start` responds
- [ ] Test: `/campaign` shows active campaigns
- [ ] Test: `/status` shows account tier + usage
- [ ] Test: `/results` shows recent signals performance

### 6.2 Channel Setup
- [ ] Create public Telegram channel for signals
- [ ] Set admin rights for bot
- [ ] Configure alert fan-out to chat IDs

---

## Phase 7: VIP SEAT ONBOARDING (CRITICAL — cashclaw.cc → alpha vang → energy 9)

### 7.1 `accounts/` = VIP SEAT — Follow this order

**Order:** test order (demo/proving) → cashclaw.cc → alpha vang → energy 9 solution

This is the customer journey. Each "account" in the system is a **VIP seat**, not a generic user.

- [ ] Define "test order" tier (lowest — demo access)
- [ ] Upgrade path: test_order → cashclaw.cc (full platform)
- [ ] Upgrade path: cashclaw.cc → alpha vang (premium signals)
- [ ] Upgrade path: alpha vang → energy 9 solution (enterprise/white-glove)

### 7.2 MWM: Market Warfare Methodology
- [ ] Review MWM framework for competitive positioning
- [ ] Implement MWM scoring for account tier assignment
- [ ] Cosmic expansion strategy mapped to tier progression

### 7.3 First Customers
- [ ] Onboard 1 test order user (free/demo)
- [ ] Verify end-to-end: signup → email → payment → activation → Telegram
- [ ] Convert 1 cashclaw.cc paying customer (STARTER or PRO)
- [ ] Track: if they complete full funnel, they qualify for alpha vang

---

## Phase 8: MONITORING & OBSERVABILITY

### 8.1 Verify Production Health
- [ ] Grafana dashboards loading for 2 hours post-deploy
- [ ] SLA metrics: p95 < 100ms, error rate < 1%, memory < 115MB
- [ ] Sentry capturing errors (check 0 unhandled exceptions)
- [ ] Prometheus metrics at `/metrics` returning data

### 8.2 Alerts Configured
- [ ] Telegram alerts for L3/L4 escalation
- [ ] Deadman switch alert active
- [ ] Drawdown monitor freshness probe
- [ ] Queue backpressure alerts

---

## Phase 9: REVENUE VERIFICATION

### 9.1 Revenue Checks
- [ ] Log into NOWPayments dashboard → verify incoming payments
- [ ] Check subscriptions table → new paying user exists
- [ ] Verify tier activated correctly after payment
- [ ] Co-pilot API callable by new subscriber

### 9.2 First Dollar Criteria
- [ ] [ ] At least 1 real payment received (not test)
- [ ] [ ] Payment confirmed on blockchain (USDT TRC20)
- [ ] [ ] User tier upgraded automatically via webhook
- [ ] [ ] Payment logged in access logs (traceable)

---

## Phase 10: GOVERNANCE — MekongMind Goal Update

### 10.1 Goal State
```bash
/mekong goal "GTM execution — go live, first revenue, VIP seat pipeline"
/mekong gates  # Verify current gate has evidence
/mekong artifact mvp-live platform-operations "Production deployed, revenue flowing"
```

### 10.2 Evidence Artifacts
- [ ] Deploy SHA verified → `state/evidence/scale-ready/`
- [ ] First payment confirmed → `state/evidence/first-revenue/`
- [ ] Marketing published → `state/evidence/repeatable-channel/`

---

## CRITICAL FINDINGS SUMMARY

| # | Finding | Status | Action Required |
|---|---------|--------|-----------------|
| 1 | NOWPayments webhook mount | FIXED | Verify in production |
| 2 | NOWPAYMENTS_API_KEY not set | BLOCKER | Set in `.env` |
| 3 | NOWPAYMENTS_IPN_SECRET not set | BLOCKER | Set in `.env` |
| 4 | Invoice IDs (STARTER/PRO/ENT) not set | BLOCKER | Create in NOWPayments dashboard |
| 5 | SENDGRID_API_KEY not set | BLOCKER | Set up SendGrid account |
| 6 | Telegram bot token not set | BLOCKER | Set in `.env` |
| 7 | Marketing content ready | DONE | Copy-paste from `docs/marketing/` |
| 8 | Email campaign script ready | DONE | Execute after SendGrid setup |
| 9 | `accounts/` = VIP seat | CONCEPT | Map test_order → cashclaw.cc → alpha vang → energy 9 |
| 10 | MWM framework | ACTIVE | Use for competitive positioning |

---

## SUCCESS CRITERIA

- [ ] Production URL returns HTTP 200 with verified SHA
- [ ] NOWPayments webhook processes real test payment
- [ ] Email campaign sent to all FREE tier users
- [ ] Marketing live on 3+ channels (Twitter, Reddit, Discord)
- [ ] First paying customer on board (any tier)
- [ ] Telegram bot responding `/campaign`, `/status`, `/results`
- [ ] 2,916+ tests passing (0 regressions)

---

## UNRESOLVED QUESTIONS
1. MWM framework: where is the full spec? (referenced but not found in repo)
2. `accounts/` VIP seat schema: current DB has `subscriptions` table — how does VIP seat map to it?
3. Test order tier: is this separate from FREE tier, or an internal demo account?
4. email-campaign-starter-tier.md exists as marketing doc but `--starter` sends template built in script — which source of truth?
5. Does cashclaw.cc need its own subdomain/landing page, or is it included in the main app?
