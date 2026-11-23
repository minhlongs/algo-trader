# POLY-G9.0 — Data Rights & Legal Check (Paper Beta)

**Date:** 2026-11-23  
**Scope:** Market-data sources consumed by `poly-beta-api` (`src/platform/poly-beta/`)  
**Paper Beta External Data Rights:** `PAPER_BETA_EXTERNAL_DATA_RIGHTS = HOLD_PENDING_VERIFICATION`  
**Continuous L2 Data License (Issue #278):** `DATA_LICENSE = HOLD`  
**External User Activation (`USER_001_INVITE`):** `HOLD`

---

## 1. Verified Market-Data Sources Consumed by Paper Beta

Inspected directly in `src/platform/poly-beta/poly-beta-markets.ts` and `src/platform/poly-beta/poly-beta-market-quotes.ts`:

| Field | Source 1: Polymarket Gamma API | Source 2: Polymarket CLOB Public API |
|---|---|---|
| **Provider** | Polymarket (Adventure One QSS, Inc. / Blockratize Inc.) | Polymarket (Adventure One QSS, Inc. / Blockratize Inc.) |
| **API / Endpoint** | `GET https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=25` | `POST https://clob.polymarket.com/books` (batched up to `MAX_BOOK_BATCH = 60` YES token IDs per refresh) |
| **Purpose in Code** | Active non-5m market universe discovery (`MAX_FEED_MARKETS = 12`) + fallback `bestBid`/`bestAsk`/`updatedAt` only when CLOB has no usable book | Per-token top-of-book quotes (`bestBid` = max bid, `bestAsk` = min ask) + exchange `timestamp` for `<= 30s` freshness gate (`MARKET_STALENESS_LIMIT_MS`) |
| **Data-Use Terms** | Public API governed by `https://polymarket.com/tos` (§4.2 Capital Market Client & Polymarket Data restrictions; prohibits unauthorized collection/use/redistribution without express written agreement) | Public API governed by `https://polymarket.com/tos` (§4.2 Capital Market Client & Polymarket Data restrictions; institutional data licensed via ICE Data Services) |
| **Historical / Live Storage** | Ephemeral 60s KV cache (`POLY_BETA_KV`, key `markets:public:v1`, `expirationTtl: 60`) + per-order/fill `source_timestamp_ms` snapshot in `poly-beta-db`. **Zero** continuous L2 orderbook recording. | Ephemeral 60s KV cache (`markets:public:v1`) + per-order/fill `source_timestamp_ms` snapshot in `poly-beta-db`. **Zero** continuous L2 orderbook recording. |
| **Commercial / Public SaaS Permission** | `UNVERIFIED / HOLD` — no written permission for commercial SaaS or redistribution | `UNVERIFIED / HOLD` — no written permission for commercial SaaS or redistribution |
| **Geographic Restrictions** | Polymarket ToS §1 / §4.1 geo-restrictions apply (no VPN/proxy circumvention); Vietnam legal gate (`G12`) remains `HOLD` | Polymarket ToS §1 / §4.1 geo-restrictions apply (no VPN/proxy circumvention); Vietnam legal gate (`G12`) remains `HOLD` |
| **Retention** | KV expires automatically at 60s; D1 per-order/fill timestamps retained until user executes `DELETE /api/beta/account` (atomic purge) | KV expires automatically at 60s; D1 per-order/fill timestamps retained until user executes `DELETE /api/beta/account` (atomic purge) |
| **Source Provenance** | Direct HTTP fetch from `POLYMARKET_PUBLIC_GAMMA_URL` (`wrangler.poly-beta.toml`) | Direct HTTP fetch from `POLYMARKET_PUBLIC_CLOB_URL` (`wrangler.poly-beta.toml`) |
| **Effective Licensing Status** | `HOLD` (unresolved) | `HOLD` (unresolved) |

---

## 2. Strict Separation of Data Rights Scopes

1. **Synthetic Test Fixtures (`deterministic-fixture`):**
   - Local unit/integration tests use deterministic synthetic fixtures injected via `fetchImpl` in `fetchSupportedBetaMarkets`.
   - Zero Polymarket API calls, zero external data rights dependency. Safe for CI and local verification.
2. **Paper Beta External Data Rights (`PAPER_BETA_EXTERNAL_DATA_RIGHTS = HOLD_PENDING_VERIFICATION`):**
   - Applies to live read-only Gamma + CLOB `/books` fetches in `poly-beta-api` for an external pilot user (`USER_001`).
   - Even though Paper Beta is simulated (`$100` virtual balance, `LIVE_TRADING_ENABLED = "false"`) and stores zero continuous L2 data, Polymarket ToS §4.2 broadly restricts API data use by fintech/prop entities without written permission.
3. **Continuous L2 Data Licensing (`DATA_LICENSE = HOLD`, Issue #278):**
   - Separate institutional licensing track for continuous L2 orderbook recording, historical backtesting, and commercial alpha research. Remains `HOLD`.

---

## 3. Data-License Inquiry Status

- **Canonical Draft:** `docs/poly-g8-6/01-DATA-LICENSE-INQUIRY.md`
- **Dispatch Status:** **UNSENT** (`DATA_LICENSE_OUTREACH = READY_FOR_FOUNDER_SEND`).
- **Action Required:** Founder must complete truthful legal-entity identity fields in `docs/poly-g8-6/01-DATA-LICENSE-INQUIRY.md` and send manually to `data-licensing@polymarket.com` / `sales-icedataservices-usinsidesales@theice.com`.
- **Constraints Respected:** Zero paid legal counsel engaged; zero contracts or click-through commercial data terms accepted.

---

## 4. Activation Hold Policy

External-user activation (`USER_001_INVITE`) **MUST remain `HOLD`** until either:
1. Polymarket data-rights permission and Vietnam legal eligibility (`G12`) are formally cleared, **OR**
2. The Founder explicitly documents a risk-accepted private-pilot scope in writing before approving Gate 6 (`USER_001_INVITE`) in `01-ROLLBACK-AND-DISABLE-RUNBOOK.md`.
