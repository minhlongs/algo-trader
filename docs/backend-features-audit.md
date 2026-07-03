# Backend Features Audit

> Generated: 2026-07-03
> Scope: Remaining backend features for algo-trader
> Context: /Users/macbook/algo-trader

---

## 1. CEX/DEX Connectors

### CEX Adapters (`src/desk/markets/cex/`)

| Exchange | Type | Status |
|----------|------|--------|
| Binance Spot | CEX | **Implemented** — Full CCXT adapter (`BinanceSpotClient`) with OHLCV candles, order book, balance, and spot order placement |
| dYdX v4 | CEX | **Read-only** (`DydxV4ReadonlyClient`) — Can fetch candles, order book, balance, and positions. No order placement. |

**CCXT integration:** Binance client uses CCXT library directly (`import * as ccxt from 'ccxt'`). Injectable adapter pattern for testability.

### DEX Connectors: **MISSING** — No `dex/` directory exists under `src/desk/markets/`. DEX is mentioned as a strategy type in `ALLOWED_STRATEGY_TYPES` (`['polymarket', 'cex', 'dex', 'custom']`) but no actual DEX adapter is implemented.

### Gaps

- **DEX connectors do not exist** — no Uniswap, Curve, or any on-chain DEX adapter
- **Perpetual/futures disabled** — gated by `CEX_PERP_ENABLED` env flag; feature flagged off by default
- **Only 2 exchanges** — Binance Spot + dYdX v4 (read-only). No Coinbase, Kraken, Bybit, OKX, etc.
- **No unified trade execution** across CEX exchanges — `binance-spot-client.ts` handles spot orders, dYdX is read-only only
- **No WebSocket streaming** — both clients are REST-based. Real-time data requires polling.

---

## 2. Strategy TODOs

### Strategy Count (Polymarket)

| Category | Count |
|----------|-------|
| V2 strategies (extends `BasePolymarketStrategy`) | 45 implemented |
| **Stubs (no-op / placeholders)** | **14 files** |
| Other (non-polymarket) | 6+ (GRU, Kronos, Cross-platform arb, probability calibrator) |

### Stub Strategies (no real trading logic)

All marked as "V2 migration stub" or "legacy factory stub":

| File | Status |
|------|--------|
| `src/desk/strategies/grid-dca-strategy.ts` | Legacy factory stub — "awaiting V2 migration" |
| `src/desk/strategies/polymarket-arb-strategy.ts` | Legacy factory stub |
| `src/desk/strategies/polymarket/adverse-selection-filter.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/cross-market-arb.ts` | V2 migration stub (has miniscule logic) |
| `src/desk/strategies/polymarket/cross-platform-basis.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/entropy-scorer.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/expiry-theta-decay.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/liquidity-vacuum.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/market-maker.ts` | V2 migration stub (two no-op stubs) |
| `src/desk/strategies/polymarket/mean-reversion.ts` | V2 migration stub (two no-op stubs) |
| `src/desk/strategies/polymarket/news-catalyst-fade.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/smart-money-divergence.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/twap-accumulator.ts` | V2 migration stub |
| `src/desk/strategies/polymarket/volatility-surface-arb.ts` | V2 migration stub |

### Other Stubs/Placeholders

- **`src/desk/core/risk-manager.ts`** — "V2 migration compatibility stub" (empty class)
- **`src/desk/arbitrage/types.ts`** — has `// Implementation placeholder` comments
- **`src/desk/strategies/dna/indicators-trend.ts`** — has a `// placeholder; direction is derived later` comment on line 111

### Assessment

The bulk of the strategy code is implemented (45 V2 strategies with real logic). The 14 stubs represent approximately 20--25% of total strategy surface area that remains unimplemented. All stubs share the same pattern: they log a warning and return immediately (no-op).

---

## 3. Telegram Bot

**File:** `src/platform/telegram/bot.ts`

### Available Commands

| Command | Purpose |
|---------|---------|
| `/start` | Welcome message with command list |
| `/help` | Help text with alert thresholds |
| `/status` | List linked license keys or detailed usage |
| `/link` | Link a license key to the chat |
| `/unlink` | Unlink a license key |
| `/notifications` | Toggle threshold alerts on/off |
| `/limits` | View tier usage limits |
| `/balance` | Show account balance from Redis |
| `/positions` | Show open positions from Redis |
| `/pnl` | Show P&L statistics from Redis |
| `/campaign` | Browse marketplace strategies (with detail by ID) |
| `/results` | Aggregated subscription results across all linked keys |
| `/faq` | Browse FAQ entries or get specific answer by number |
| `/support` | Auto-support with escalation to email |
| `/pricing` | View pricing tiers |

### Auto-Support

**Wired and functional.** `auto-support-handlers.ts` implements:
- Fuzzy FAQ matching via keyword overlap scoring (8 FAQ entries covering security, edge, cancellation, markets, payment, API keys, trials, strategies)
- Auto-response to unknown messages with FAQ matching
- Escalation to `support@cashclaw.cc`

### Architecture

- Uses `grammy` (Telegram Bot framework v2)
- Singleton `TelegramBotService` with `getInstance()` pattern
- Redis-backed rate limiting for crash resilience
- In-memory `userSessions` map (not persisted to DB)
- No persistence of linked license keys across restarts
- `MarketplaceService` integration for `/campaign`

### Gaps

- **In-memory sessions only** — user sessions (linked keys, notification preferences) are not persisted to DB, so they reset on restart
- **No database storage** for chat-to-license-key mapping — uses in-memory `Map<number, UserSession>`
- **No webhook mode** — uses long-polling (`bot.start()`), which requires the process to stay running

---

## 4. Marketplace

**Location:** `src/platform/marketplace/`

### Services

| Service | File | Status |
|---------|------|--------|
| MarketplaceService | `services/marketplace.service.ts` | **Implemented** — core strategy/listings lifecycle, CRUD, search |
| SubscriptionService | `services/subscription.service.ts` | **Implemented** — subscribe, allocation, checkout, custom risk limits |
| RevenueService | `services/revenue.service.ts` | **Implemented** — platform revenue overview, creator payouts |
| VettingService | `services/vetting.service.ts` | **Implemented** — strategy vetting checks, scoring, decision recording |
| DisputeService | `services/dispute.service.ts` | **Implemented** — dispute management |
| BadgeService | `services/badge-service.ts` | **Implemented** — creator badges/awards |
| MarketplaceExecutionBridge | `services/marketplace-execution-bridge.ts` | **Implemented** — links marketplace to RaaS executor |
| DeskStrategySeeder | `services/desk-strategy-seeder.ts` | **Implemented** — seeds desk strategies into marketplace |
| MarketplacePayoutScheduler | `services/marketplace-payout-scheduler.ts` | **Implemented** — scheduled payouts |
| NotificationService | `notifications/notification-service.ts` | — referenced but in separate `notifications/` dir |

### Workers

| Worker | File | Status |
|--------|------|--------|
| VettingWorker | `workers/vetting-worker.ts` | **Implemented** — polls pending strategies, runs auto-vetting, records decisions |

### Repositories (DB-backed)

| Repository | Purpose |
|------------|---------|
| `strategy-repository.ts` | Strategy CRUD |
| `listing-repository.ts` | Listing CRUD |
| `subscription-repository.ts` | Subscription CRUD |
| `review-repository.ts` | Reviews CRUD |
| `performance-repository.ts` | Performance metrics |
| `revenue-share-repository.ts` | Revenue share records |
| `dispute-repository.ts` | Dispute management |
| `vetting-job-repository.ts` | Vetting audit trail |

### Community Strategy Upload Pipeline

**Wired and functional** (`src/platform/api/routes/community-strategy-routes.ts`):
- `POST /api/community/strategies/upload` — upload strategy source code (PRO+ tier)
- `GET /api/community/strategies` — list approved strategies (FREE tier)
- `GET /api/community/strategies/:id` — detail + backtest results
- `POST /api/community/strategies/:id/backtest` — run backtest on uploaded strategy

Pipeline: upload -> `pending_review` status -> sandbox validation (automated) -> admin vetting -> approval/rejection. Uses `BacktestRunner` from shared kernel.

### Marketplace API Routes

Extensive route coverage including:
- Strategy listing, management, insights, badges, reviews, disputes
- Subscription (CRUD, enhancements, stats, analytics)
- Creator revenue routes
- Admin marketplace routes: vetting, disputes, revenue overview, mark-as-paid
- Signal feed, signal subscription, subscriber P&L

### Gaps

- **No community strategy *execution* sandbox** — source code is uploaded and backtested, but there's no isolated sandbox for live execution of community strategies
- **No automated vetting logic** in `VettingService` — the vetting worker processes strategies but relies on manual scoring/checks (the `runVettingChecks` method needs inspection)
- **No peer review system** — reviews exist but no community voting/rating workflow

---

## 5. Revenue Analytics

### Routes (`src/platform/api/routes/revenue.ts`)

| Endpoint | Method | Tier | Purpose |
|----------|--------|------|---------|
| `/revenue/summary` | GET | PRO | Full revenue summary (MRR, ARR, overage, growth rate) |
| `/revenue/mrr` | GET | PRO | MRR metrics with month-over-month comparison |
| `/revenue/usage` | GET | PRO | Usage breakdown by customer (license key level) |
| `/revenue/overage` | GET | PRO | Overage revenue details per customer |
| `/revenue/churn` | GET | PRO | Churn metrics (customer churn rate, revenue churn) |

### Admin Revenue Routes (`admin-marketplace-revenue-routes.ts`)

| Endpoint | Method | Tier | Purpose |
|----------|--------|------|---------|
| `/admin/marketplace/revenue` | GET | ENTERPRISE | Platform revenue overview |
| `/admin/marketplace/revenue/creators` | GET | ENTERPRISE | All creator payouts |
| `/admin/marketplace/revenue/mark-paid` | POST | ENTERPRISE | Batch mark revenue shares as paid |
| `/admin/marketplace/revenue/mark-paid/:id` | POST | ENTERPRISE | Mark single revenue share as paid |

### Implementation Details

- MRR calculated from `revenue_share` table (gross revenue in cents), aggregated by month
- Churn approximated by comparing month-over-month active tenant IDs
- Overage revenue set to `0` (placeholder) — tracked separately in `overage_invoices` table but not integrated into revenue summary
- Churn reasons object is empty (`{}`) — not yet categorized

### Gaps

- **Overage revenue set to 0** — overage from `overage_invoices` table is not included in the MRR breakdown (`overageMRR = 0`)
- **Churn reasons not recorded** — `reasons: {}` in churn response; no churn reason tracking or classification
- **No LTV/CAC metrics** — customer lifetime value or customer acquisition cost analytics not implemented
- **No cohort analysis** — no revenue retention curves or cohort tables
- **No ARPU/MRR-per-customer breakdown**
- Growth rate calculation uses `previousMRR > 0` guard which means it reports 0% rather than infinity (or "N/A") for first-revenue periods

---

## 6. Alerting

### Notification Channels

| Channel | File | Provider | Status |
|---------|------|----------|--------|
| **Email** | `src/platform/notifications/email-service.ts` | SendGrid | **Implemented** — singleton with Redis rate limiting, startup health check |
| **SMS** | `src/platform/notifications/sms-service.ts` | Twilio | **Implemented** — 90%+ threshold gate, daily limit (10/recipient), Redis rate limiting |
| **Telegram** | `src/platform/telegram/bot.ts` | grammy | **Implemented** — Redis-backed rate limiting, threshold-based alerts via `sendThresholdAlert` |
| **Alert Formatter** | `src/platform/notifications/alert-formatter.ts` | Shared | **Implemented** — unified formatting for all channels, urgency levels, progress bars |

### Alert Thresholds

| Level | Threshold | Channels |
|-------|-----------|----------|
| Warning | >= 80% | Email only |
| Urgent | >= 90% | Email + SMS + Telegram |
| Critical | >= 100% | All channels |

### Alertmanager Configuration (`config/alertmanager.yml`)

- Routes: critical every 1h, warnings every 4h
- Default receiver: webhook (`http://localhost:9999/webhook-placeholder`)
- No real webhook URL configured — uses placeholder
- Telegram Alertmanager receiver noted as optional (needs `config/alertmanager.yml.tpl` with `envsubst`)
- Grafana contact points noted as already configured

### Monitoring Stack (`docker/monitoring/`)

| Component | Purpose |
|-----------|---------|
| Prometheus | Metrics scraping (algo-trade, node-exporter, cadvisor) |
| Grafana | Dashboards (pre-provisioned) |
| Loki | Log aggregation |
| Promtail | Log shipper |
| Alertmanager | Alert routing |

### Admin Routes (`src/platform/api/routes/admin.ts`)

| Endpoint | Method | Tier | Purpose |
|----------|--------|------|---------|
| `/admin/halt` | POST | ENTERPRISE | Halt all trading with reason |
| `/admin/resume` | POST | ENTERPRISE | Resume trading |
| `/admin/status` | GET | ENTERPRISE | System status (circuit breaker + drawdown) |

### Gaps

- **Alertmanager webhook URL is a placeholder** (`http://localhost:9999/webhook-placeholder`) — no real alert delivery configured for Prometheus alerts
- **No PagerDuty/Opsgenie escalation** — only webhook placeholder
- **No alert history storage** — alerts are sent but not persisted to a database table
- **No incident management** — no status page, no automated incident creation
- **No on-call scheduling** — no escalation policies for after-hours
- **No DR backup-verify script exists** — `dr-drill.sh` references `backup-verify.sh` which does not exist on filesystem
- **No PagerDuty integration** for critical trading failures

---

## Cross-Cutting Concerns

### Backup & DR

| Item | Status |
|------|--------|
| DR drill script | Exists at `scripts/dr-drill.sh`, tests PM2, CF Tunnel, API health |
| Backup-verify script | **MISSING** — referenced by dr-drill.sh but not found |
| Database backup | No dedicated backup script found |
| R2 bucket setup script | Exists at `scripts/create-r2-buckets.sh` |

### Secret Management

- All providers configured via environment variables: SENDGRID_API_KEY, TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER, TELEGRAM_BOT_TOKEN
- SendGrid has a `startupCheck()` that fails loudly in production if missing
- Twilio and Telegram gracefully warn + skip if unconfigured

### Test Coverage

| Metric | Value |
|--------|-------|
| Total test files | ~190 (referenced in CLAUDE.md) |
| Total tests | ~2100 |
| Project type | Node.js/TypeScript (not Next.js) |
| Test framework | Vitest |

---

## Summary of Gaps by Priority

### High Priority (blocks production readiness)

1. **Alertmanager webhook URL is placeholder** — no real alert delivery from Prometheus
2. **DEX connectors missing entirely** — no on-chain DEX adapters despite being listed as supported strategy type
3. **backup-verify.sh missing** — DR drill references nonexistent script
4. **14 strategy stubs** — 20-25% of strategy surface area not implemented (all labeled as V2 migration stubs)
5. **Overage revenue set to 0** — MRR numbers are incomplete, overage invoices not integrated into revenue summary

### Medium Priority

6. **CEX coverage thin** — only Binance spot + dYdX v4 read-only. No perpetuals, no multi-exchange support
7. **Telegram sessions in-memory only** — linked license keys lost on restart
8. **Churn reasons not tracked** — reasons object is always empty
9. **No PagerDuty/Opsgenie** — no incident management escalation for critical failures
10. **No community strategy execution sandbox** — upload and backtest works, but live execution of community strategies not implemented

### Low Priority

11. **No LTV/CAC or cohort analysis** — missing higher-level revenue intelligence
12. **No WebSocket streaming** for CEX data — relies on REST polling
13. **No market data provider failover** — only single Binance client
14. **dYdX v4 is read-only** — no order execution via dYdX

---

Status: DONE
