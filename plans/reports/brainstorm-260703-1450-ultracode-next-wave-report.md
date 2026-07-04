---
title: "Ultracode Next Wave — GTM + i18n + Billing + Infra"
description: "4 independent parallel tracks: go-to-market, full i18n, remaining billing persistence, infrastructure hardening"
created: "2026-07-03T14:50:00.000Z"
status: approved
sub-projects:
  - A: go-to-market
  - B: full-i18n
  - C: billing-persistence-phase-2
  - D: infrastructure-load-testing
---

# Ultracode Next Wave — GTM + i18n + Billing + Infra

## Background

Previous sessions completed: pricing unification (14 files), CI fix (2,790 tests), subscriber pages, eses, landing page enhancement, billing persistence (3 core tables), enterprise consolidation, investor one-pager rewrite. Platform is technically revenue-ready.

Current state:
- **2,790 tests passing**, 37 migrations, 34 dashboard pages
- **0 community channels live** (Discord/Twitter/Polymarket all "MANUAL not yet registered")
- **31 pages English-only** (only 4 have i18n)
- **6 in-memory Map services** remaining
- **12 marketing docs ready-to-post** but unpublished

## Sub-Projects

All 4 are fully independent — no shared file conflicts. Run in true parallel.

### A: Go-to-Market 🚀

| Sub-Task | Action | Artifacts |
|----------|--------|-----------|
| A1 | Launch Discord server | Server created, channels set up, announcement posted |
| A2 | Activate Telegram bot | Wire bot token, test /campaign /status /results commands |
| A3 | Publish content + create Twitter | First blog post published, @CashClaw handle created |

**Risks:** Discord/Telegram/Twitter account creation is manual (user must do it). Bot token must be obtained from @BotFather. Ready-to-post content exists in `docs/marketing/`.

### B: Full i18n 🌐

| Sub-Task | Action | Artifacts |
|----------|--------|-----------|
| B1 | Fix dual i18n libraries | Pick react-i18next (already used in marketplace), remove react-intl |
| B2 | Translate 5 high-traffic pages | pricing, signup, login, settings, account — ~100 keys |

**Risks:** Standardization of two i18n libraries affects existing translations on live trading page (uses react-intl). Must migrate those to react-i18next.

### C: Billing Persistence Phase 2 🗄️

| Migration | Table | Service |
|-----------|-------|---------|
| 046 | coupon_service | coupon-service.ts (currently JSON file) |
| 047 | trial_drip_subscribers | trial-drip-service.ts (currently Map) |
| 048 | enterprise_inquiries | enterprise-inquiry-store.ts (currently Map) |
| 049 | api_keys | api-key-manager.ts (currently Map) |
| 050 | onboarding_pending | onboarding-service.ts (currently Map) |
| 051 | usage_metering | usage-metering.ts (currently Map) |

**Risks:** Proven pattern from 043-045. Each migration + service refactor takes ~10-15 min. Api-key-manager has security implications (scrypt-hashed keys).

### D: Infrastructure Hardening 📊

| Sub-Task | Action | Artifacts |
|----------|--------|-----------|
| D1 | Fix k6 auth headers | Update load test script to include auth tokens |
| D2 | Run load test baseline | Measure with 100 VUs, 30s, per-endpoint metrics |
| D3 | Profile one hot path | CPU/memory on a key route |

**Risks:** Needs running production stack or Docker stack for meaningful results.

## Success Criteria

- [ ] Discord server live with announcement posted
- [ ] Telegram bot responds to /campaign /status /results
- [ ] First blog post published, Twitter handle created
- [ ] 31 pages bilingual (EN/VN) — dual i18n library consolidated
- [ ] 6 PostgreSQL migrations created + services refactored
- [ ] k6 load test baseline with auth headers, metrics recorded
