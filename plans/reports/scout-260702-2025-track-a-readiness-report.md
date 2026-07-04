# Scout Report: Revenue Go-Live Readiness

**Date:** 2026-07-02 20:50
**Project:** algo-trader (CashClaw)
**Scope:** Track A — deploy script, NOWPayments IPN, launch content, live trading runbook, CLI trade commands, deployment docs, landing page

---

## 1. Deploy Script: `scripts/deploy-production.sh`

**Status: DONE**

Comprehensive production deployment script with staged gates:

- **Gate 0** — Git clean check (can be bypassed with `ALLOW_DIRTY_DEPLOY=1`)
- **Gate 1** — TypeScript compile via `pnpm typecheck`
- **Gate 2** — ESLint (0 errors, ≤ 100 warnings)
- **Gate 3** — Vitest (any failed tests abort)
- **Gate 4** — Worker build (`tsc -p tsconfig.worker.json`)
- **Gate 5** — Secrets audit on staged files
- **CF Worker deploy** — wrangler secret put for COMMIT_SHA, DEPLOYED_AT, DEPLOY_BRANCH, then `wrangler deploy`
- **Docker stack deploy** — invokes `scripts/start-production.sh --detach`

Post-deploy verification: SHA match against live `/api/version`, HTTP health check at `/health`.

---

## 2. NOWPayments IPN: `src/platform/billing/nowpayments-service.ts`

**Status: DONE_WITH_CONCERNS**

Service class features:
- HMAC-SHA512 signature verification (`verifyWebhook`)
- Pre-created invoice checkout URL generation
- Marketplace dynamic invoice creation
- Payment status checking via REST API
- Payout creation (USDT TRC20)
- Tier-to-invoice mapping for PRO ($99) and ENTERPRISE ($299)

**Concerns:**
1. **IPN webhook HTTP route not verified** — The actual route handler (`POST /api/webhooks/nowpayments`) that receives callbacks may be missing or incomplete. Without it, paid subscriptions never activate.
2. **Silent credential failures** — If `NOWPAYMENTS_API_KEY` or `NOWPAYMENTS_IPN_SECRET` are missing, service logs a warning and continues. Production deploy with missing creds = silently broken payments.
3. **No IPN handler idempotency** — If the same `finished` payment arrives twice, no dedup logic visible.

---

## 3. Launch Content: `docs/marketing/launch-posts-ready-to-post.md`

**Status: DONE_WITH_CONCERNS**

48-hour schedule covering:

| Time | Channel | Type |
|------|---------|------|
| T-24h | Twitter | Single teaser post |
| T-24h | Polymarket Discord | Community teaser |
| T-0h | Twitter | 7-tweet launch thread |
| T+4h | Polymarket Discord | Full launch drop |
| T+12h | Reddit r/algotrading | Technical deep-dive |
| T+24h | Twitter | Metrics follow-up |
| T+48h | Polymarket Discord | Community check-in |

**Concerns:**
1. **All `[INSERT]` placeholders unfilled** — Real launch metrics needed (signups, signal volume, top strategy)
2. **Checklist items unchecked** — All 7 posting checklist items pending
3. **Pre-post checklist incomplete** — Update branding, fill INSERT placeholders, test cashclaw.cc load, test signup flow
4. **No LinkedIn/Product Hunt/Telegram coverage**

---

## 4. Live Trading Runbook: `docs/live-trading-runbook.md`

**Status: DONE**

Complete graduated rollout: paper (50+ ticks) → backtest (30+ days) → live (after gates pass).

Pre-live checks: Sharpe > 0.5, max drawdown < 20%, win rate > 40%, wallet ≥ $100 USDC.

Live guardrails: 20% max position, -20% daily drawdown circuit breaker, max 5 concurrent. Incident response + rollback covered.

Bilingual (Vietnamese/English). Production-ready.

---

## 5. CLI Trade Commands: `src/desk/cli/cashclaw-trade-commands.ts`

**Status: DONE**

`algo trade start --mode=live` fully implemented:
- Validates all 4 Polymarket env vars before proceeding
- Interactive confirmation ("Confirm? (y/N)")
- Displays guard limits before confirmation
- Legacy `POLY_*` fallback for env var names

---

## 6. Deployment Guide: `docs/deployment-guide.md`

**Status: DONE_WITH_CONCERNS**

Covers zero-config quickstart, Docker Compose stack, CI/CD pipeline, env vars, monitoring stack, health checks, production/marketplace checklists.

**Concerns:**
1. **No actual production URLs documented** — Uses example domain only
2. **No rollback procedure** for VPS deployments
3. **No scaling thresholds** — What happens at 100 tenants?

---

## 7. Landing Page: `landing/`

**Status: DONE**

Production-grade landing page at `cashclaw.cc` (Cloudflare Pages):
- Terminal-brutalism design, hero, stats bar, how-it-works, features grid
- 3 pricing tiers: Starter ($49), Pro ($149), Elite ($499)
- Coupon code input, activation modal, FAQ, social proof
- SEO: OG tags, Twitter Cards, JSON-LD, sitemap, robots.txt
- Security: CSP, HSTS, X-Frame-Options, Permissions-Policy
- Deploy scripts + past deploy reports

---

## Summary

| Item | Status | Key Concern |
|------|--------|-------------|
| 1. Deploy script | ✅ DONE | — |
| 2. NOWPayments IPN | ⚠️ DONE_WITH_CONCERNS | IPN route handler verification; silent credential failures |
| 3. Launch content | ⚠️ DONE_WITH_CONCERNS | Placeholder metrics unfilled; checklist unchecked |
| 4. Live trading runbook | ✅ DONE | — |
| 5. CLI trade commands | ✅ DONE | — |
| 6. Deployment guide | ⚠️ DONE_WITH_CONCERNS | Missing production URLs, rollback procedure |
| 7. Landing page | ✅ DONE | — |
