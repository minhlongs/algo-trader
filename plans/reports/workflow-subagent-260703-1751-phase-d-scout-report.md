# Phase D (Customer Activation) Scout Report

## Files Inventory

### Telegram (`src/platform/telegram/`)

| File | Status | Notes |
|------|--------|-------|
| `bot.ts` | EXISTS | Fully implemented singleton pattern. Already wires `/campaign`, `/status`, `/results` to handlers. User sessions stored in-memory `Map` (line 54) with TODO for PostgreSQL migration. |
| `bot-command-handlers.ts` | EXISTS | Contains ALL command handlers. `handleCampaign()` uses `MarketplaceService` for live data. `handleResults()` uses Redis for P&L. NOT placeholders. |
| `auto-support-handlers.ts` | EXISTS | `/faq`, `/support`, `/pricing` handlers |
| `trading-alerts.ts` | EXISTS | Threshold alert service |
| `campaign-handler.ts` | NOT NEEDED | Logic already lives in `bot-command-handlers.ts` as `handleCampaign()` |
| `status-handler.ts` | NOT NEEDED | Logic already lives in `bot-command-handlers.ts` as `handleStatus()` |
| `results-handler.ts` | NOT NEEDED | Logic already lives in `bot-command-handlers.ts` as `handleResults()` |
| `user-session-store.ts` | NEW | Migration from Map to PostgreSQL still TODO |

### Referral (`src/platform/referral/`)

| File | Status | Notes |
|------|--------|-------|
| `referral-service.ts` | EXISTS | Mature service: code generation, tracking, commissions, fraud detection, monthly payout job |
| `referral-crud.ts` | EXISTS | Full SQL CRUD for all 3 tables |
| `referral-repository.ts` | EXISTS | Wrapper around CRUD |
| `fraud-detector.ts` | EXISTS | Fraud detection with score 0-100 |
| `commission-calculator.ts` | EXISTS | 10% fixed rate commission calculation |
| `payout-scheduler.ts` | EXISTS | Monthly payout job |
| `referral-analytics.ts` | EXISTS | Analytics aggregator |
| `types.ts` | EXISTS | Well-typed interfaces for all referral entities |
| `referral-code-generator.ts` | NOT NEEDED | Logic exists as private method in `referral-service.ts` (generateUniqueCode, 8-char alphanumeric). Phase file proposes different format (ALGO-XXXXXX-CRC8). |

### API Routes (`src/platform/api/routes/`)

| File | Status | Notes |
|------|--------|-------|
| `referral-routes.ts` | EXISTS | 11 endpoints fully implemented: GET /stats, GET /code, POST /generate-code, POST /track-click, GET /commissions, GET /payouts, POST /validate, GET /my-code, GET /clicks/:code, GET /conversion-summary, POST /record-conversion |
| `schemas/referral.schemas.ts` | EXISTS | Zod schemas for validation |

### Landing Pages (`src/platform/landing/public/`)

| File | Status | Notes |
|------|--------|-------|
| `index.html` | EXISTS | 1085 lines, English-only, static HTML no JS framework, no locale selector, no i18n |
| `pricing.html` | EXISTS | 545 lines, English-only, static HTML |
| `login.html` | EXISTS | 172 lines, English-only, static HTML |
| `register.html` | EXISTS | 260 lines, English-only, static HTML. Form sends email/password/confirmPassword to `/api/auth/register`. NO referral code field. |

### Dashboard (`dashboard/src/`)

| Section | Status | Notes |
|---------|--------|-------|
| `i18n/config.ts` | EXISTS | Uses react-i18next, language detector (localStorage + navigator). No react-intl remaining. |
| `locales/en.ts` | EXISTS | 295 translation keys, complete |
| `locales/vi.ts` | EXISTS | 295 translation keys, identical structure to en.ts |
| `language-switcher.tsx` (components/) | EXISTS | Toggle EN/VI, already in dashboard header |
| Pages with i18n | 26 of 34 | Uses `useTranslation()` and `t()` |
| Pages WITHOUT i18n | 8 | analytics-page, guide-page, manifesto, privacy-page, setup-guide-page, subscriber-equity, subscriber-trade-history, terms-page |
| `signup-page.tsx` | EXISTS | Uses i18n, has email/password/tier fields. **NO referral code field**. |
| `login-page.tsx` | EXISTS | Uses i18n |
| `referral-page.tsx` | EXISTS | Fully implemented with stats, commissions, payouts |
| `referral-code-input.tsx` (components/) | **NEEDED** | No existing component for referral code input on signup |

### Database

| File | Status | Notes |
|------|--------|-------|
| `migrations/024_create_referral_tables.sql` | EXISTS | Creates referral_codes, referral_tracking, referral_commissions tables. Already in production. |
| `migrations/024-create-referral-tables.ts` | EXISTS | Programmatic migration runner |
| `migrations/052-referral-codes.sql` | NOT NEEDED | Migration 024 already exists; phase file assumed higher number |

### Auth

| File | Status | Notes |
|------|--------|-------|
| `auth/auth-server.ts` | EXISTS | BetterAuth instance with PostgreSQL. Has `databaseHooks.user.create.after` hook that registers trial drip. NO referral conversion handling. |
| `dashboard/stores/auth-store.ts` | EXISTS | Zustand store using BetterAuth client. `signup()` accepts email/password/tier only -- NO referral code. |

### Marketing Docs (`docs/marketing/`)

| File | Status | Notes |
|------|--------|-------|
| `launch-posts-ready-to-post.md` | FRESH | Prediction market focused, ready. 48h schedule with Twitter, Reddit, Discord content. |
| `golive-launch-content.md` | FRESH | Prediction market focused, ready. 8-tweet thread, copy-paste ready. |
| `golive-announcement-brief.md` | FRESH | Strategic brief with audience segments and posting schedule. |
| `twitter-thread.md` | STALE | Old crypto arbitrage content (12 tweets), needs rewrite for prediction markets |
| `reddit-posts.md` | STALE | Old crypto arbitrage content, needs rewrite |
| `discord-announce.md` | STALE | Old crypto arbitrage content, needs rewrite |
| `blog-arbitrage-engine.md` | STALE | Old crypto arbitrage technical blog, needs rewrite |
| `investor-one-pager.md` | EXISTS | Investor-facing doc |
| `email-sequence.md` | EXISTS | Email marketing sequence |
| `landing-page.md` | EXISTS | Landing page copy brief |

## i18n Gap Analysis

### Dashboard pages needing i18n (8 pages)
Each has hardcoded English strings that must be extracted into translation keys:

1. **analytics-page.tsx** -- KPI labels, filter labels, button text (~15 strings)
2. **guide-page.tsx** -- Delegates to GuideContent component (~10 strings in component)
3. **manifesto.tsx** -- Renders markdown, likely English-only content
4. **privacy-page.tsx** -- "Privacy Policy", body text, "Back to home" (~10 strings)
5. **setup-guide-page.tsx** -- "Full Setup Guide", subtitle text, delegates to SetupGuideContent (~8 + component strings)
6. **subscriber-equity.tsx** -- "Equity Curve", "Tenant:", "Starting Capital", "Current NAV", "Total Return", "Max Drawdown", "Refresh", "Retry" (~20 strings)
7. **subscriber-trade-history.tsx** -- "Trade History", "Tenant:", "Refresh", "Loading...", "Retry", pagination controls (~15 strings)
8. **terms-page.tsx** -- "Terms of Service", body text (~10 strings)

### Landing pages needing i18n (4 pages, static HTML)
These are significantly harder because they are static HTML files:
- Need a JavaScript-based i18n solution (fetch JSON translations, update DOM)
- Add locale selector component with inline JS
- Each page has 100+ strings embedded in HTML
- Script injection for coupon activation also has hardcoded English strings

## Test Coverage
- Referral routes have integration tests (`referral-routes.test.ts`)
- Telegram has one test for auto-support handlers
- Dashboard has page-level tests for 8 pages (but not the 8 pages without i18n)
- **No tests exist** for: Telegram bot command handlers, referral service, referral CRUD, referral repository, landing pages (no framework)
- 3 dashboard page tests use `@ts-nocheck`, indicating potential test fragility

## Key Risks
1. **Landing page i18n is harder than expected** -- Static HTML requires JS-based solution, not react-i18next. Significantly more work than the phase file implies.
2. **Referral code -> signup integration requires backend changes** -- Must modify auth-server.ts `databaseHooks.user.create.after` to capture referral code and call POST /record-conversion. Frontend signup form needs referral code field + validation endpoint call.
3. **Telegram session migration must not break existing sessions** -- Need gradual migration: load from both Map and DB, write-through to DB, eventually remove Map.
4. **Marketing mix of stale/fresh docs could cause confusion** -- Some docs pitch crypto arbitrage while platform is now prediction markets. Need review before publishing.
5. **Webhook URL change on deploy** -- No script to re-register Telegram webhook after deployment.
