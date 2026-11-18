# POLY-G5 Release A Deployment Evidence, Rollback Runbook & Outstanding Blockers

- **Timestamp:** `2026-11-15T06:14:19Z` (`2026-11-15T13:14:19+07:00`)
- **Base Commit:** `b778f53a03bd933fbb0a9eefaee82acd461374fc`

---

## 1. Isolated Cloudflare Public Beta Deployment Evidence (Release A)

| Component | Resource Name / ID | Live URL / Binding | Status |
|---|---|---|---|
| **Pages Frontend** | `poly-beta-dashboard` | `https://poly-beta-dashboard.pages.dev` (`https://c3b2d396.poly-beta-dashboard.pages.dev`) | **HTTP/2 200 (LIVE)** |
| **Worker API** | `poly-beta-api` (Version `051c4720-85a8-42dc-b6f9-b1521e4b529c`) | `https://poly-beta-api.agencyos-openclaw.workers.dev` (`routes = []`) | **HTTP 200 (`PAPER_ONLY`)** |
| **D1 Authoritative Ledger** | `poly-beta-db` (`9abb7e79-aeae-452e-a626-d913bc2a8a51`) | `env.POLY_BETA_DB` (8 tables, `tenant_id` partitioned) | **Migrated & Verified** |
| **KV Rate-Limit & Cache** | `POLY_BETA_KV` (`d6bbbfe9aab64ea88a15ec3d51714430`) | `env.POLY_BETA_KV` | **Bound & Verified** |
| **Serialized Engine DO** | `TenantPaperEngine` (`v1-poly-beta-engine` SQLite DO) | `env.TENANT_PAPER_ENGINE` | **Active-Only Alarm Verified** |

### Live First-User & Playwright E2E Verification (`G8`, `G10`)
- **Command:** `npx playwright test --config=playwright.poly-beta.config.ts`
- **Result:** `2 passed (22.1s)` across **Desktop Chromium** and **Mobile Pixel 5** against live `https://poly-beta-dashboard.pages.dev` + `https://poly-beta-api.agencyos-openclaw.workers.dev`:
  1. Landing page & simulation/loss risk banner verified (`LIVE_TRADING_ENABLED=false`).
  2. First-user signup with mandatory disclosure checkbox provisioned `$100.00` genesis ledger (`#1 GENESIS_GRANT`).
  3. Strategy `START` (`RUNNING` → active position opened on live Polymarket quote) → `PAUSE` (`PAUSED`) → `STOP` (`STOPPED`) verified.
  4. Deposit / Live Trading button verified fail-closed (`[403] REAL_MONEY_OPERATIONS_DISABLED`).
  5. Second isolated browser context (User B) verified strict cross-tenant isolation (`$100.00` cash, `0` User A positions).
  6. Self-service account deletion (`DELETE /api/beta/account`) verified full tenant purge and session revocation (`0` test accounts left behind in `poly-beta-db`).
- **Screenshots Captured (`plans/reports/poly-g5-screenshots/`):**
  - `01-landing-desktop-chromium.png`, `01-landing-mobile-pixel5.png`
  - `02-genesis-portfolio-desktop-chromium.png`, `02-genesis-portfolio-mobile-pixel5.png`
  - `03-active-positions-and-403-lock-desktop-chromium.png`, `03-active-positions-and-403-lock-mobile-pixel5.png`

### Production Non-Interference Proof (`G9`)
- `git diff -- wrangler.toml migrations/d1/` → **0 lines changed**.
- `https://cashclaw.cc` → `HTTP/2 200` (unchanged).
- `https://quant.cashclaw.cc` → `HTTP/2 200` (unchanged).
- `https://api.cashclaw.cc/` → `{"service":"algo-trader API","version":"1.0","status":"ok","edge":"cloudflare","environment":"production","hasVps":true}` (unchanged).

---

## 2. Rollback Runbook (Release A)

Because Release A is 100% isolated from `algo-trader` production, rolling back or tearing down Release A has **zero blast radius** on `cashclaw.cc` or `api.cashclaw.cc/*`:

1. **Instant Worker Version Rollback (< 10 seconds):**
   ```bash
   npx wrangler rollback --config wrangler.poly-beta.toml
   ```
2. **Full Public Beta Shutdown (if needed by Owner):**
   ```bash
   npx wrangler delete --name poly-beta-api --config wrangler.poly-beta.toml
   npx wrangler pages project delete poly-beta-dashboard --yes
   ```

---

## 3. Outstanding Blockers Before Release B ($100 Live Pilot) or Production Scale

1. **`G12` Legal & Jurisdictional Clearance (`HOLD`):** Operator/user context (Vietnam) has no external legal sign-off for live prediction-market execution, brokerage/software classification, or Polymarket Terms geographic eligibility. VPN/proxy circumvention is strictly forbidden.
2. **`G11` Economic & Statistical Validation (`HOLD / UNKNOWN`):** Local/cloud storage holds `0 / 30` required days of continuous point-in-time `poly-book` L2 WAL data, `0 / 500` qualifying simulated maker fills with 60s markout, and `0 / 150` resolved prospective sealed OOS forecasts for the Market-Blind AI branch (`w_skill = 0` remains locked).
3. **Live ExchangeV2/V3 Signed Order Smoke Verification:** While offline EIP-712 byte-for-byte SDK parity (`#272`) and compiled Rust `ghostguard` drills (`74.35ms`) now pass 100%, live Exchange endpoint acceptance can only be tested once `G12` and `G13` authorize a non-custodial wallet test.
4. **`G13` Founder Exclusive Real-Capital Sign-Off (`HOLD`):** Requires explicit Founder written authorization after `G11` and `G12` pass.

## Unresolved Questions
- When and where the Founder wishes to schedule the 30-day read-only `poly-book` L2 data capture (`G11`) and external legal review (`G12`).
