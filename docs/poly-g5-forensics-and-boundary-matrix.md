# POLY-G5 Phase 0 — Repository Forensics, IC Deviations & Security Boundary Matrix

- **Baseline Commit Verified:** `b778f53a03bd933fbb0a9eefaee82acd461374fc` (`main`, PR `#270` merged).
- **Isolated Work Branch:** `feat/poly-g5-public-beta` (worktree isolated from `main`).

---

## 1. Current Infrastructure & Route Inventory (Pre-Change Baseline)

| Surface | Existing Resource | Domain / Route | Production Status | POLY-G5 Policy |
|---|---|---|---|---|
| Cloudflare Worker | `algo-trader` (`wrangler.toml`) | `api.cashclaw.cc/*` (zone `cashclaw.cc`) | LIVE (HTTP 501 on unmigrated VPS fallback routes, 200 on `/`) | **DO NOT MODIFY OR REASSIGN (G1, G9)** |
| Cloudflare Worker Env | `algo-trader-staging` / regional envs | `routes = []` | Staging | **DO NOT REPURPOSE** |
| Cloudflare Pages | `algo-trader` | `algo-trader.pages.dev`, `cashclaw.cc`, `www.cashclaw.cc` | LIVE (`HTTP/2 200`) | **DO NOT MODIFY (G1, G9)** |
| Cloudflare Pages | `algo-trader-dashboard` | `algo-trader-dashboard.pages.dev`, `quant.cashclaw.cc` | LIVE (`HTTP/2 200`) | **DO NOT MODIFY (G1, G9)** |
| Cloudflare D1 | `algo-trader-db` (`f29559f2-...`), `cashclaw-prod` (`1aa0d940-...`) | Bound to `algo-trader` Worker | LIVE | **NO PROD MIGRATIONS OR SHARED BINDINGS (G9)** |
| Rust Sidecars | `sidecars/poly-book`, `sidecars/ghost-guard` | Local/CLI child processes (`scripts/poly-sidecars.ts`) | **NEVER ACTIVATED IN CF PRODUCTION** (Workers cannot `spawn` native ELF/Mach-O binaries) | Keep for local/CI drills (`G5`, `G7`); document CF Containers vs VPS trade-off for Release B |

---

## 2. Forensics of Existing Endpoints & Security Gaps (Pre-Remediation)

| Existing Endpoint (`src/platform/workers/`) | Observed Behavior at `b778f53a` | Security / Product Finding | Disposition for Release A (`poly-beta-api`) |
|---|---|---|---|
| `POST /api/auth/signup`, `POST /api/auth/login` (`auth-handlers.ts`) | Stores user in KV (`user:{email}`), returns raw bearer JWT in JSON body; no cookies, no CSRF, no rate limiting | Vulnerable to XSS token theft if stored in `localStorage` and brute-force login attempts | Replaced in `poly-beta-api` by D1-backed users/sessions, `HttpOnly; Secure; SameSite=None` session cookie, server-bound CSRF token, Origin allowlist, and KV rate limiting |
| `POST /api/auth/delete` (`auth-handlers.ts:115`) | Requires `x-api-key === ADMIN_API_KEY`; end users cannot delete their own account | Fails GDPR / first-user self-service account deletion requirement | `poly-beta-api` implements authenticated self-service `DELETE /api/beta/account` purging user, sessions, DO state, orders, fills, and ledger rows |
| `GET /api/v1/paper-trades` (`edge-proxy-inline-routes.ts:80`) | Unauthenticated `SELECT ... FROM paper_trades_v3 LIMIT 1000` with **no `tenant_id` column** | Cross-tenant data exposure if used for multi-user SaaS; lacks fees, settled vs unrealized PnL, and balance accounting | Isolated `poly-beta-db` enforces `tenant_id` on every table and server-side ownership checks on 100% of queries |
| `GET /api/markets` (`api/markets.ts:70`) | Hardcodes 3 Binance symbols with `price: 0` | Disconnected from Polymarket Gamma/CLOB data and lacks source timestamps | `poly-beta-api` serves verified Polymarket markets with `sourceTimestamp`, staleness age, and 5-minute Crypto exclusion |
| `POST /api/v1/strategies/execute` (`api/markets.ts:33`) | Checks `Authorization: Bearer ...` string prefix **without `verifyJwt()`** before forwarding to `ShardManager` DO | Unverified bearer header accepted; however `StrategyShard` only computes RSI/SMA signal math (no exchange keys or live execution capability) | Excluded from `poly-beta-api`; `poly-beta-api` verifies session + CSRF + `tenant_id` before invoking `TenantPaperEngine` DO |
| `POST /api/webhooks/nowpayments` & `/api/v1/subscriptions/*` | Payment webhook & billing upgrade handlers | Real-money payment surface not permitted in no-funds Release A | Completely omitted/blocked (`403 PAPER_BETA_REAL_MONEY_DISABLED`) on `poly-beta-api` |

**Confirmation on Unintended Live Execution Exposure:** Neither `edge-proxy.ts` nor `StrategyShard` holds `POLY_PRIVATE_KEY`, `POLY_API_KEY`, or imports `LiveTradingOrchestrator` (`LIVE_TRADING_ENABLED` defaults unset / `'false'` across `src/desk/execution/execution-mode.ts:48`). No live order capability is exposed on the existing Worker, and `poly-beta-api` adds an explicit `LIVE_TRADING_ENABLED = "false"` hard lock returning `403` on any live/deposit/withdrawal/approval route.

---

## 3. Forensics of Blocker #271 & Blocker #272

### Blocker A — Issue #271 (`npm run build:worker` / `npm run disk:check`)
- **Reproduced Output on Node v26.7.0:** `tsc -p tsconfig.worker.json` exits `0`, then `npm run disk:check` (`pnpm exec ts-node scripts/disk-monitor.ts`) crashes with `Error: Cannot find module './disk-monitor.ts'` under `ts-node@10.9.2` CJS loader.
- **Root Cause:** `scripts/disk-monitor.ts` is missing from the repository while `package.json` still invokes it via `ts-node` (which also breaks on Node 26 ESM/strip-types loader semantics).
- **Minimal Reliable Fix:** Implement `scripts/disk-monitor.ts` (cross-platform `fs.statfsSync` check enforcing minimum free space warning/threshold cleanly) and invoke via `node --import tsx scripts/disk-monitor.ts` so both Node 22 (CI) and Node 26 (local) run cleanly with zero suppressed errors.

### Blocker B — Issue #272 (`clob-v2-order-signing.ts` vs `@polymarket/clob-client-v2`)
- **Direct SDK Inspection (`@polymarket/clob-client-v2@0.2.7`):**
  - `dist/order-utils/model/ctfExchangeV2TypedData.js` defines:
    - `CTF_EXCHANGE_V2_DOMAIN_NAME = "Polymarket CTF Exchange"`
    - `CTF_EXCHANGE_V2_DOMAIN_VERSION = "2"` (configurable domain version if Polymarket deploys a `"3"` contract upgrade; Polygon mainnet `config.js` pins `exchangeV2 = 0xE111180000d2663C0091e4f400237545B87B996B` and `negRiskExchangeV2 = 0xe2222d279d744050d28e00520010520000310F59`).
    - `CTF_EXCHANGE_V2_ORDER_STRUCT` (11 signed EIP-712 fields in exact order):
      1. `salt` (`uint256`)
      2. `maker` (`address`)
      3. `signer` (`address`)
      4. `tokenId` (`uint256`)
      5. `makerAmount` (`uint256`)
      6. `takerAmount` (`uint256`)
      7. `side` (`uint8` — `0` BUY, `1` SELL)
      8. `signatureType` (`uint8` — `0` EOA, `1` POLY_PROXY, `2` POLY_GNOSIS_SAFE, `3` POLY_1271)
      9. `timestamp` (`uint256`)
      10. `metadata` (`bytes32`)
      11. `builder` (`bytes32`)
  - **Signed vs Transport Separation (`orderToJsonV2`):** `expiration` (`string`), `orderType` (`GTC|GTD|FOK|FAK`), `postOnly` (`boolean`), `deferExec` (`boolean`), `owner` (API key), and `signature` are **HTTP transport payload fields** in V2 — `expiration`, `nonce`, `taker`, and `feeRateBps` are **NOT** in the V2 EIP-712 signed struct (whereas V1 signed `taker`, `expiration`, `nonce`, `feeRateBps` without `timestamp`, `metadata`, `builder`).
  - **Pre-Fix Defect in `src/desk/polymarket/clob-v2-order-signing.ts`:** Previously signed a hybrid 9-field struct omitting `salt`, `maker`, `signer`, `timestamp`, `metadata` while erroneously signing `expiration`, `nonce`, and `feeRateBps`, which produces an `orderHash` and `signature` guaranteed to fail `ExchangeOrderBuilderV2` / on-chain `ecrecover` / `isValidSignature`.

---

## 4. IC Architecture Deviation Ledger

| IC Requirement | Current Repo State (`b778f53a`) | Deviation & POLY-G5 Resolution |
|---|---|---|
| ExchangeV2/V3 EIP-712 `Order` struct compatibility | Hybrid 9-field struct in `clob-v2-order-signing.ts` (`#272`) | **Remediated in Phase 4-B:** Exact 11-field struct byte-for-byte verified against `@polymarket/clob-client-v2` `ExchangeOrderBuilderV2` + transport serializer separation |
| Worker compilation & pre-build check | Fails on missing `scripts/disk-monitor.ts` (`#271`) | **Remediated in Phase 4-A:** Clean `tsx`-executed `scripts/disk-monitor.ts` |
| Trading heartbeat must not sit behind a 5-minute cron | Legacy `edge-proxy.ts` ran `runPaperTradingTick` on `*/5 * * * *` | **Remediated in Phase 1:** `TenantPaperEngine` Durable Object uses per-session `alarm()` (10s active tick) + explicit staleness fail-closed; zero 5m cron reliance |
| Rust sidecars (`poly-book`, `ghostguard`) in cloud | Compiled locally only; standard CF Workers cannot spawn child binaries | **Documented & Gated:** Kept offline/CI for Release A ($0 real funds); ADR evaluates CF Containers vs VPS for Release B |
| IC Micro-Pilot capital (`2,500–5,000 pUSD`) vs `$100` Pilot | Proposed `$100` candidate envelope (`$20` max exposure, `$5` max order) | **Recorded Deviation in Phase 5:** `$100` is strictly an operational plumbing smoke test, NOT statistical alpha proof; kept DISABLED (`HOLD`) |
| `>= 30` days L2 data & `>= 500` fills for economic validation | Local `sidecars/poly-book/data/wal` has `0` live multi-week segments | **Honest `UNKNOWN` / `HOLD` in Phase 6 (`G11`):** Reported with exact observed sample sizes; zero fabricated alpha claims |

---

## 5. Deployment Security Boundary Matrix

| Boundary | Release A (`poly-beta-*`) | Existing Production (`algo-trader` / `cashclaw.cc`) | Release B (`$100 Live Pilot` — DISABLED) |
|---|---|---|---|
| **Pages Project** | `poly-beta-dashboard` (`*.pages.dev`) | `algo-trader` & `algo-trader-dashboard` | Not deployed |
| **Worker Service** | `poly-beta-api` (`wrangler.poly-beta.toml`, `routes = []`) | `algo-trader` (`wrangler.toml`, `api.cashclaw.cc/*`) | Disabled behind `LIVE_TRADING_ENABLED=false` + G11–G13 |
| **Database (D1)** | `poly-beta-db` (`tenant_id` mandatory on all tables) | `algo-trader-db` / `cashclaw-prod` | Separate non-custodial audit store (not created) |
| **State Serialization** | `TenantPaperEngine` DO (`idFromName(tenantId)`) | `ShardManager` / `StrategyShard` DOs | Disabled |
| **Custody / Keys** | **None** ($100 simulated ledger only; 0 wallet keys) | Encrypted CEX BYOK (untouched) | Non-custodial user-owned wallet + bounded session signer (`Poly1271`, `MASTER_KEY_FORBIDDEN_IN_RUNTIME`) |
| **Deposit / Live API** | Hard-coded `403 LIVE_TRADING_DISABLED` | Untouched | Blocked until G11 + G12 + G13 PASS |

## Unresolved Questions
- Legal eligibility for Vietnam-based operation/users (`G12`) remains `HOLD` pending independent legal counsel; live pilot stays disabled.
