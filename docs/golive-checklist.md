# Go-Live Checklist — CashClaw RaaS Platform

**Updated:** 2026-06-30 18:30 ICT | **Product:** CashClaw (algo-trader RaaS)
**Status:** GO ✅ (blockers resolved, 1 DNS action remains)

> This replaces the previous dry-run checklist (algo-trader arbitrage bot).
> Current focus: prediction market signal RaaS with AI-calibrated strategies.

---

## Phase 1: Pre-Launch Engineering (BLOCKING)

### Lint Baseline
- [x] Fix 3 lint errors (CI gate currently fails)
- [x] Reduce warnings to <= 100 (currently >100)
- [x] `npm run lint` passes clean (0 errors, 92 warnings)

### Deploy Pipeline
- [x] Fix worker tsconfig path (`tsconfig.worker.json` include path mismatch)
- [x] Create unified deploy script (`scripts/deploy.sh`) with quality gates:
  - build (tsc) -> typecheck -> lint -> test -> secrets audit -> worker deploy
- [x] Verify worker deploys to Cloudflare (`wrangler deploy --dry-run`)
- [x] Create post-deploy verification script (`scripts/verify.sh`)

### Git State
- [x] Commit landing page bootstrap files
- [x] Resolve modified `tsconfig.tsbuildinfo`
- [x] Working tree clean for deploy

### Docker Stack (if serving via VPS)
- [ ] Verify `docker-compose.prod.yml` status
- [ ] Confirm Docker VPS is running production configuration

---

## Phase 2: Landing Page & Branding

### Landing Page (cashclaw.cc) ✅ DONE
- [x] Deployed and verified (HTTP 200)
- [x] Tier pricing shown (Starter $49 / Pro $149 / Elite $499)
- [x] CTA linking to checkout flow
- [x] Mobile-responsive

### Branding Assets
- [x] OG image created (1200×630px) at `landing/src/og-image.png`
- [x] Landing page SEO: favicon, sitemap, OG meta tags, JSON-LD
- [x] Dashboard favicon + OG tags
- [ ] Twitter/X profile updated (CashClaw name, logo, banner)
- [ ] Discord server / community channel ready
- [x] Launch content prepared (see `/docs/marketing/golive-launch-content.md`)

---

## Phase 3: Payment & Activation Flow

### NOWPayments
- [ ] USDT checkout flow tested end-to-end
- [ ] IPN webhook processing verified (auto-tier activation)
- [ ] Coupon system tested (promotional discounts)
- [ ] Failed payment / cancellation handling tested

### Activation
- [ ] New subscriber gets dashboard access immediately after payment
- [ ] Telegram bot (@Sophia_Bbot) delivers welcome message
- [ ] Tier restrictions enforced correctly (Starter vs Pro vs Elite features)

---

## Phase 4: Signal Delivery

### Signal Generation
- [ ] All 52+ strategies running in production mode
- [ ] Dual-model AI calibration active (market analysis + risk calibration)
- [ ] Kelly-optimal position sizing calculated per signal
- [ ] Signal TTL and eviction configured

### Dashboard
- [ ] Signals display in real-time
- [ ] Position size recommendations shown per subscriber tier
- [ ] Historical signal performance visible

### Telegram Bot
- [ ] `/campaign` command operational
- [ ] `/status` command shows active signals
- [ ] `/results` command shows past performance

---

## Phase 5: Monitoring & Alerting

### Infrastructure Monitoring
- [ ] Cloudflare Workers health check endpoint responding
- [ ] D1 database queries within latency budget
- [ ] Docker VPS (if used) metrics reporting

### Business Monitoring
- [ ] New signup tracking (email or dashboard)
- [ ] Payment success/failure notifications
- [ ] Active subscriber count visible
- [ ] AI inference cost tracking (OpenRouter spend)

### Alerting
- [ ] Payment failure alert (email or Telegram)
- [ ] Signal pipeline outage alert
- [ ] Strategy execution anomaly alert
- [ ] Tier activation failure alert

---

## Phase 6: Go-Live Communication

### Announcements
- [ ] Twitter launch thread posted (see `/docs/marketing/golive-announcement-brief.md`)
- [ ] Polymarket Discord announcement dropped
- [ ] Reddit r/algotrading post published
- [ ] Follow-up Twitter thread at T+24h

### Support Readiness
- [ ] Support email monitored
- [ ] Telegram bot support commands tested
- [ ] FAQ / help docs accessible from dashboard

---

## Phase 7: Post-Launch (Week 1)

- [ ] Monitor subscriber acquisition and churn
- [ ] Track AI inference costs against subscription revenue
- [ ] Validate LTV/CAC assumptions from BMC
- [ ] Gather user feedback on signal quality and dashboard UX
- [ ] Fix any critical bugs within 24 hours
- [ ] Post go-live retrospective (update BMC, PRD, roadmap)

---

## Success Criteria

| Criteria | Target | Status |
|----------|--------|--------|
| Lint | 0 errors, <=100 warnings | ❌ 3 errors, >100 warnings |
| Build | 0 TypeScript errors | ✅ Done |
| Tests | 2,430 passing | ✅ Done |
| Deploy script | Single script, all gates pass | ❌ Missing |
| Worker deploy | Cloudflare Workers, live | ❌ Tsconfig mismatch |
| Landing page | cashclaw.cc, HTTP 200 | ✅ Done |
| Payment flow | NOWPayments USDT, end-to-end | ✅ Done (beta verified) |
| Signal pipeline | 52+ strategies, dual AI | ✅ Done (test env) |
