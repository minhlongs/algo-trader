# Code Review Report — POLY-G5 Public Beta & Live-Pilot Prep (Round 1)

- **Branch:** `feat/poly-g5-public-beta` (base `b778f53a`)
- **Worktree:** `/Users/macbook/algo-trader-poly-g5`
- **Reviewer:** `code-reviewer` (Adversarial Production-Readiness Audit)
- **Timestamp:** `2026-11-15T13:32:00+07:00` (`Asia/Saigon`)
- **Score:** **6.8 / 10** — **CHANGES REQUESTED (2 CRITICAL, 6 HIGH, 4 MEDIUM, 2 LOW)**

---

## Scope & Verification Summary

- **Files Inspected:** 44 modified/added files across `wrangler.poly-beta.toml`, `tsconfig.poly-beta.json`, `migrations/poly-beta-d1/0001-poly-beta-ledger.sql`, `src/platform/poly-beta/*.ts` (16 files), `src/shared/polymarket/five-minute-crypto-guard.ts`, `src/desk/polymarket/{clob-v2-*,poly1271-session-signer,poly-settlement-reconciliation-drills,five-minute-crypto-guard}.ts`, `scripts/disk-monitor.ts`, `package.json`, `dashboard/src/poly-beta/*` (6 files), `dashboard/src/App.tsx`, `playwright.poly-beta.config.ts`, `tests/{poly-beta,polymarket,scripts,e2e}/*`, and `docs/poly-g5-*.md` (5 files).
- **LOC Reviewed:** ~4,730 LOC across `src/`, `scripts/`, and `dashboard/src/` + tests/migrations/docs.
- **Runnable Checks Executed Independently:**
  - `git diff b778f53a -- wrangler.toml migrations/ src/platform/workers/` -> **0 lines changed** (Prod CashClaw config/routes untouched).
  - `npx tsc --noEmit` & `npx tsc -p tsconfig.poly-beta.json` -> **0 errors**.
  - `npm run build:worker` (`tsc -p tsconfig.worker.json && npm run disk:check`) -> **PASS**.
  - `cd dashboard && npm run build` & `VITE_APP_MODE=poly-beta npm run build` -> **PASS**.
  - `npx eslint --max-warnings 0` on all 25 changed/new `src/**/*.ts` files -> **0 errors, 0 warnings**.
  - `node scripts/ci-gate-secret-scan.mjs`, `bash scripts/ci-gate-paper-gate-lock.sh`, `node scripts/check-quality-baseline.mjs --quality` + manual grep across untracked files -> **0 `:any`, 0 `console.*` in `src/`, 0 `eval`, every `src/**/*.ts` <= 200 LOC, `LIVE_TRADING_ENABLED=false` preserved**.
  - `npx vitest run` (8 suites, 38 tests) -> **38/38 PASS**; `v8` coverage on changed/new `src/` files = **93.20% stmts / 83.10% branches / 87.50% funcs / 94.86% lines**.

---

## Overall Assessment

Infrastructure isolation (`wrangler.poly-beta.toml` with `routes = []`, separate D1/KV/DO bindings, hard `LIVE_TRADING_ENABLED=false` 403/503 locks, and honest `HOLD` verdicts on G11/G12/G13) is solid and leaves existing CashClaw production untouched.

However, deep adversarial inspection uncovered **2 CRITICAL** and **6 HIGH** defects that pass happy-path tests but break accounting invariants, EIP-712 SDK compatibility, cookie security, Hard Rule H4 error sanitization, circuit-breaker enforcement, and git tracking of the E2E suite. Merge must hold until C1–C2 and H1–H6 are fixed.

---

## CRITICAL Issues (Blocking)

### C1. Authoritative Ledger PnL Drift on `BUY` Fees, Unbacked `PENDING` Limit Orders, and Incomplete Binary Settlement
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-execution.ts:80-103, 117, 127-148, 175-177`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-settlement.ts:22-77`
- **Problem & Impact:**
  1. **Broken Equity Reconciliation Invariant:** On `BUY` fills (`poly-beta-execution.ts:127-131`), `cash_balance_micro` is debited by `notionalMicro + feeMicro`, while `realizedDeltaMicro` stays `0` (line 117) and `avg_entry_micro` excludes `feeMicro` (`priceMicro`). When those shares are later sold (`line 147`) or settled (`poly-beta-settlement.ts:26-27`), only the `SELL` fee or `avg_entry_micro` cost basis is deducted. Consequently, **`initialCapital + realizedPnl + unrealizedPnl + settledPnl !== totalEquity`** after every `BUY` fill — off by `-sum(buyFees)`. Example: buy 10 shares @ `$0.50` (`$0.025` fee), sell 10 shares @ `$0.50` (`$0.025` fee) -> `totalEquity = $99.95` (`-$0.05` true PnL), yet `realized + unrealized + settled = -$0.025`.
  2. **Unbacked Resting Limit Orders & Dead Order Book:** Resting limit orders (`poly-beta-execution.ts:80-103`) skip `cash_balance_micro` checks, `$20` `MAX_PORTFOLIO_EXPOSURE_MICRO` checks, and `SELL` position ownership checks. A user with `0` shares can place `PENDING` `SELL` orders (violating no-short-selling), or place unlimited `$4.99` `PENDING` `BUY` orders exceeding `$100` cash and `$20` exposure. Furthermore, no code path in `src/platform/poly-beta/` ever matches/fills `PENDING` orders when market prices cross `price_micro`.
  3. **Incomplete Settlement Accounting:** `settleSerializedPaperMarket` (`poly-beta-settlement.ts:22-77`) (a) never calls `refreshMarksAndDrawdown` or halts the engine / cancels DO alarms when a losing binary resolution drops equity past the `5.00%` drawdown limit, (b) leaves resting `PENDING` orders open on the resolved `marketId`, and (c) never writes `side = 'SETTLE'` rows to `beta_fills` despite `0001-poly-beta-ledger.sql:91,97` defining `CHECK (side IN ('BUY','SELL','SETTLE'))` and `settled_delta_micro`.
- **Fix:**
  - Record `realizedDeltaMicro = -feeMicro` on `BUY` fills so `initialCapital + realizedPnl + unrealizedPnl + settledPnl === totalEquity` holds at every point in time.
  - Validate cash + open `PENDING` reserve, `$20` exposure (including `PENDING` buys), and unencumbered share ownership (subtracting `PENDING` sells) before inserting `PENDING` orders, and match crossing `PENDING` orders on engine ticks.
  - In `settleSerializedPaperMarket`, cancel `PENDING` orders for `marketId`, insert `SETTLE` fill rows into `beta_fills`, and run `refreshMarksAndDrawdown` (clearing DO alarm if drawdown `>= 500 bps`). Label user-invoked settlements explicitly as simulated drills in `beta_ledger_entries.note`.

### C2. CLOB V2 EIP-712 SDK Parity Breaks on Fractional Sizes/Ticks, Default Domain Version `"3"` vs `"2"`, and Tampered `signedMessage` Verification
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/src/desk/polymarket/clob-v2-order-signing.ts:84, 88-89`
  - `/Users/macbook/algo-trader-poly-g5/src/desk/polymarket/poly1271-session-signer.ts:146, 161-168`
  - `/Users/macbook/algo-trader-poly-g5/src/desk/polymarket/clob-v2-order-verifier.ts:47, 55, 69`
  - `/Users/macbook/algo-trader-poly-g5/src/desk/polymarket/clob-v2-order-transport.ts:51-74`
- **Problem & Impact:**
  1. **Fractional Size & Tick-Precision Divergence:** `buildClobV2TypedData` (`clob-v2-order-signing.ts:88-89`) computes `Math.round(intent.size * 1e6)` and `Math.round(intent.size * intent.price * 1e6)`, ignoring `@polymarket/clob-client-v2`'s `ROUNDING_CONFIG[tickSize]` (which truncates share `size` to 2 decimals via `roundDown(size, 2)` and rounds collateral to `4/5/6` decimals by `tickSize`). Empirically verified against `@polymarket/clob-client-v2@0.2.7`: `BUY size=10.123, price=0.456, tickSize=0.001` produces SDK `makerAmount="4614720", takerAmount="10120000"`, whereas `buildClobV2TypedData` produces `makerAmount="4616088", takerAmount="10123000"` — different `orderHash`, different ECDSA signature, and venue precision rejection. The SDK parity test only passed because it tested integer `size: 10, price: 0.6`.
  2. **Silent Domain Version Mismatch on V2 Contracts:** `buildClobV2TypedData` defaults `domain.version` to `'3'` (`EXCHANGE_V3_DOMAIN_VERSION`), and `Poly1271SessionSigner` leaves `domainVersion` `undefined` by default (`poly1271-session-signer.ts:163`). Calling `new Poly1271SessionSigner({ verifyingContract: CLOB_V2_EXCHANGE_POLYGON_ADDRESS, ... }).signOrder(...)` signs `version: "3"` against Polygon's V2 contract (`0xE111...996B`), which requires `version: "2"` per `@polymarket/clob-client-v2`.
  3. **Verifier / Transport Split-Brain (`signed.order` vs `signed.signedMessage`):** `verifyClobV2SignedOrder` (`clob-v2-order-verifier.ts:69`) reconstructs EIP-712 data from `signed.order` and ignores `signed.signedMessage` and `signed.orderHash`, whereas `buildClobV2TransportPayload` (`clob-v2-order-transport.ts:59-74`) serializes `signed.signedMessage`! Mutating `signed.signedMessage.makerAmount` passes `verifyClobV2SignedOrder` (`ok: true`) and emits an invalid transport payload. Additionally, `BigInt(signed.order.nonce ?? '0')` (`verifier.ts:55`) throws uncaught `SyntaxError` on non-numeric strings, `Number.parseInt(salt, 10)` (`transport.ts:51`) silently truncates `"42abc"` to `42`, and expiry checks (`verifier.ts:39, 47`, `poly1271-session-signer.ts:152`) use `>` instead of `>=`.
- **Fix:**
  - Mirror `@polymarket/clob-client-v2` `ROUNDING_CONFIG[tickSize]` (`roundDown` / `roundNormal` / `parseUnits(..., 6)`) in `buildClobV2TypedData` and add fractional size/tick golden vectors (`0.1`, `0.01`, `0.001`, `0.0001`) to `clob-v2-order-signing-sdk-parity.test.ts`.
  - Default `domainVersion` to `'2'` whenever `verifyingContract` matches `CLOB_V2_EXCHANGE_POLYGON_ADDRESS` or `CLOB_V2_NEG_RISK_EXCHANGE_POLYGON_ADDRESS` (including inside `Poly1271SessionSigner`).
  - In `verifyClobV2SignedOrder`, verify `signed.signedMessage` deep-equals `typed.message` and `signed.orderHash === TypedDataEncoder.hash(...)`, guard `BigInt` / `getAddress` inside `try/catch`, enforce `/^\d+$/` + `BigInt` range on transport `salt`, and fail closed at `nowSec >= exp`.

---

## HIGH Priority Issues (Blocking)

### H1. Broken `__Host-` Cookie Prefix (`__Host_` Underscore Typo) & Dev Cookie Shadowing Over HTTPS
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-types.ts:15-16`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-security.ts:144-171`
- **Problem & Impact:**
  1. `SESSION_COOKIE_NAME` is `'__Host_poly_beta_sid'` (underscore) instead of RFC 6265bis `'__Host-poly_beta_sid'` (hyphen). Browsers treat `__Host_...` as a regular cookie with **zero** `__Host-` prefix guarantees (no browser-enforced `Secure`, host-only no-`Domain`, `Path=/` lock).
  2. `extractSessionTokenFromCookie` (`poly-beta-security.ts:159-171`) accepts `DEV_SESSION_COOKIE_NAME` (`poly_beta_sid`) unconditionally even on `https:` requests and returns whichever cookie appears first in the `Cookie` header, allowing session fixation via cookie shadowing if ever hosted under a shared parent domain.
- **Fix:** Rename `SESSION_COOKIE_NAME` to `'__Host-poly_beta_sid'`, pass `isHttps` into `extractSessionTokenFromCookie(cookieHeader, isHttps)`, and reject `DEV_SESSION_COOKIE_NAME` when `isHttps === true`.

### H2. Missing Worker Error Boundary, Raw `err.message` HTTP Leakage (Hard Rule H4), Non-Atomic D1 Writes, and Cross-Site `GET` Write Race
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-worker.ts:36-140, 96, 121-132`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-markets.ts:176-181`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-genesis.ts:23-74`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-execution.ts:133-178`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-account.ts:53-78`
- **Problem & Impact:**
  1. **Hard Rule H4 Violation:** `poly-beta-markets.ts:180` captures `err instanceof Error ? err.message : ...` and returns it directly in HTTP JSON on `/api/beta/markets` (`staleReason`), `/api/beta/portfolio` (`health.staleReason`), and `/api/beta/orders` (`detail`). Furthermore, `poly-beta-worker.ts:36` has **zero `try/catch`** around `fetch()` — any D1 error or concurrent duplicate-email signup race (`UNIQUE constraint failed: beta_users.email` between `poly-beta-auth.ts:70` and `poly-beta-genesis.ts:25`) crashes the Worker unhandled without sanitization or security headers.
  2. **Non-Atomic Multi-Statement D1 Writes:** `provisionTenantGenesisLedger` (5 statements), `executeSerializedPaperOrder` (5 statements), `settleSerializedPaperMarket` (3 statements/position), and `handleBetaDeleteAccount` (8 table deletes) run sequential `await db.prepare(...).run()` calls without `db.batch([...])`. Partial failure corrupts ledger balances/sequences or leaves half-deleted zombie accounts (`beta_sessions` wiped while `beta_users` blocks re-signup).
  3. **Cross-Site `GET` Mutating D1 Outside DO:** Because cookies use `SameSite=None`, cross-site `GET /api/beta/portfolio` requests carry the session cookie without CSRF/Origin checks, yet `buildAuthoritativeDashboardView` invokes `refreshMarksAndDrawdown` directly in the Worker (outside `TenantPaperEngine` DO), writing `beta_positions`, `beta_portfolios`, and `beta_execution_logs` concurrently with DO mutations.
- **Fix:** Wrap `poly-beta-worker.ts` and `TenantPaperEngine.fetch`/`alarm` in sanitized `try/catch` boundaries (never exposing raw `err.message`), map `UNIQUE` email races to `409 EMAIL_EXISTS`, execute multi-table writes via atomic `db.batch([...])`, and keep `GET /api/beta/portfolio` pure read-only (compute live MTM/drawdown in memory for display; persist state transitions only inside `TenantPaperEngine` DO).

### H3. Drawdown Circuit-Breaker Bypass on `START`/`PAUSE`/`STOP`, Ignored Step Return Value, and Undifferentiated Strategy Loop
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/tenant-paper-engine-do.ts:112-136`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/tenant-paper-engine-actions.ts:55-77, 79-108`
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-execution.ts:71`
- **Problem & Impact:**
  1. **Halt Bypass:** `handleControl` (`START` at `do.ts:112-117`) unconditionally overwrites `engine_state = 'RUNNING', halt_reason = NULL` even when `max_drawdown_bps >= MAX_CUMULATIVE_DRAWDOWN_BPS (500)`, and `executeSerializedPaperOrder:71` checks `currentDrawdownBps` rather than `max_drawdown_bps`. `applyEngineStopOrPause` (`actions.ts:94-98`) also overwrites `HALTED` to `PAUSED`/`STOPPED` while leaving stale `halt_reason`.
  2. **Alarm Leak / Log Spam After Risk Halt or Cap:** `runEngineStrategyStep` (`actions.ts:66-76`) ignores `executeSerializedPaperOrder`'s return value and unconditionally returns `true`. When a step hits `STALE_MARKET_DATA`, `ENGINE_HALTED`, or `$20` `MAX_EXPOSURE_CAP` (reached after ~4 ticks = 40s), `START` falsely reports `{ engineState: 'RUNNING' }` and the 10s DO alarm keeps firing for all 180 ticks, inserting ~176 `RISK_BLOCK` D1 log rows per session.
  3. **Undifferentiated Strategy Implementation:** `APPROVED_PAPER_STRATEGIES` (`poly-beta-types.ts:36-64`) describes three distinct strategies (Maker 0 bps post-only with OFI/VPIN, NegRisk parity, Bayesian `w_skill=0`), yet `runEngineStrategyStep` executes the identical hardcoded market taker `BUY YES` order (charging taker fees) regardless of `selected_strategy_id`.
- **Fix:** Refuse `START` (409 `DRAWDOWN_HALT_LOCKED`) when `max_drawdown_bps >= MAX_CUMULATIVE_DRAWDOWN_BPS` unless an explicit paper-portfolio reset action is invoked; preserve `HALTED` on `PAUSE`/`STOP`; return `false` from `runEngineStrategyStep` when `executeSerializedPaperOrder` returns `ENGINE_HALTED` / `STALE_MARKET_DATA` (and pause or quote passive maker orders instead of spamming `MAX_EXPOSURE_CAP`); differentiate strategy step logic so `toxicity-aware-mm-paper` places post-only 0-bps maker quotes as advertised.

### H4. Market Feed Staleness Laundering, Synthetic Quote Fallback, and Phantom Unit Test Calling Live Polymarket API
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-markets.ts:75-96`
  - `/Users/macbook/algo-trader-poly-g5/tests/poly-beta/poly-beta-security-and-ledger.test.ts:397-421`
- **Problem & Impact:**
  1. **Staleness Laundering:** `normalizeGammaMarkets` (`poly-beta-markets.ts:92-95`) sets `sourceTimestampMs = Number.isFinite(parsedUpdated) && fetchedAtMs - parsedUpdated <= MARKET_STALENESS_LIMIT_MS ? parsedUpdated : fetchedAtMs`. Whenever Gamma's `updatedAt` is **stale** (`> 30s`) or missing, it stamps `fetchedAtMs` (`nowMs`), making `isMarketSnapshotFresh` (`poly-beta-execution.ts:60`) unreachable on normalized feeds.
  2. **Synthetic Price Fabrication:** Lines `75-86` synthesize `midRaw = 0.5`, `bestBid = 0.49`, `bestAsk = 0.51` whenever Gamma omits `outcomePrices`/`bestBid`/`bestAsk`, contradicting `poly-beta-dashboard-view.ts:5` (*"Zero placeholder or inferred values"*).
  3. **Phantom Unit Test Hitting Live Network:** `poly-beta-security-and-ledger.test.ts:398-400` writes a stale snapshot into KV without mocking `fetch` or `POLYMARKET_PUBLIC_GAMMA_URL`. `fetchSupportedBetaMarkets` skips the stale KV entry and makes a **real outbound HTTPS call to `https://gamma-api.polymarket.com`** during `vitest`, returning `503` only because fixture ID `'mkt-fed-rate-2026'` is absent from live Gamma (`!market`), never exercising `isMarketSnapshotFresh`!
- **Fix:** Drop Gamma markets lacking valid finite `bestBid`/`bestAsk` (`0 < bestBid < bestAsk < 1`), track `observedQuoteAtMs` honestly without overwriting stale timestamps, and pass a deterministic `fetchImpl` / mock URL in `poly-beta-security-and-ledger.test.ts`.

### H5. `.gitignore` Excludes `tests/e2e/poly-beta-first-user.spec.ts` & Playwright Config Hardcodes `/Users/macbook/...`
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/.gitignore:29-33`
  - `/Users/macbook/algo-trader-poly-g5/playwright.poly-beta.config.ts:4-5, 13`
- **Problem & Impact:**
  1. `.gitignore:29` ignores `tests/e2e/*` with explicit `!tests/e2e/{arbitrage,marl,amm,alpha-lab}` allowlist entries only. Verified via `git check-ignore -v tests/e2e/poly-beta-first-user.spec.ts`: **git silently ignores the new Playwright E2E spec**, so staging/committing the PR commits `playwright.poly-beta.config.ts` (`testMatch: 'poly-beta-first-user.spec.ts'`) with **0 matching test files in git/CI**!
  2. `playwright.poly-beta.config.ts:4-5` hardcodes `/Users/macbook/Library/Caches/ms-playwright/...`, leaking local machine path structure into repo config.
- **Fix:** Add `!tests/e2e/poly-beta-first-user.spec.ts` to `.gitignore` and read `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` from env instead of hardcoding `/Users/macbook/...`.

### H6. React Effect Loop Overwriting User Strategy Selection, Missing `RUNNING` Poll, and Missing `NO`-Side UI Controls
- **Locations:**
  - `/Users/macbook/algo-trader-poly-g5/dashboard/src/poly-beta/poly-beta-shell.tsx:20-50, 111-123`
  - `/Users/macbook/algo-trader-poly-g5/dashboard/src/poly-beta/poly-beta-controls-health.tsx:113-137`
  - `/Users/macbook/algo-trader-poly-g5/dashboard/src/poly-beta/poly-beta-ledger-tables.tsx:74-81`
- **Problem & Impact:**
  1. `loadPortfolio` (`poly-beta-shell.tsx:20-32`) depends on `[selectedMarket]`, and `useEffect` (`lines 34-50`) depends on `[loadPortfolio]`. Changing the market `<select>` recreates `loadPortfolio`, re-runs `/api/beta/auth/me` + `/api/beta/portfolio`, and executes `setSelectedStrategy(res.data.engine.selectedStrategyId)` (line 24), silently clobbering any strategy the user just selected.
  2. While `view.engine.state === 'RUNNING'`, the UI has no `setInterval` poll, so 10s DO alarm fills/halts never appear without manual action. Also, between `onAuthenticated` and `loadPortfolio()` resolving (or if `/api/beta/portfolio` errors), `!view` keeps `PolyBetaLandingAuth` rendered with no loading/error feedback.
  3. `PolyBetaControlsHealth` provides `BUY YES`, `BUY NO`, and `SELL YES` buttons, **omitting `SELL NO`** (users who buy `NO` cannot close their position manually). `PolyBetaLedgerTables` only renders `Settle YES ($1)` even on `NO` positions.
- **Fix:** Stabilize `loadPortfolio` with `useCallback(..., [])` (using functional state update `setSelectedMarket((prev) => prev || ...)`), add a 10s `useEffect` poll gated on `authState === 'authed' && view?.engine.state === 'RUNNING'`, render a dedicated loading/retry state when `authState === 'authed' && !view`, and add `SELL NO` + `Settle NO ($1)` buttons.

---

## MEDIUM Priority Issues

### M1. Non-Atomic KV Rate Limiter, Spoofable `X-Forwarded-For`, and Unthrottled Amplification Routes
- **Locations:** `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-security.ts:173-189`, `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-auth.ts:33-35`, `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-worker.ts:75-101, 118-132`
- **Problem & Impact:** KV `get` + `put` rate limiting is non-atomic under concurrent bursts; `clientIpKey` falls back to spoofable `X-Forwarded-For`; `DELETE /api/beta/account` and `GET /api/beta/portfolio` bypass `checkRateLimit`; `/api/health` and `/api/beta/markets` do not negative-cache upstream failures, enabling unauthenticated 1:1 upstream amplification against `gamma-api.polymarket.com`.
- **Fix:** Short-TTL negative-cache upstream market errors (e.g. 60s KV sentinel with 5–10s logical backoff), rate-limit `/api/beta/account` and `/api/beta/markets`, and ignore `X-Forwarded-For` in production (`ENVIRONMENT === 'public-beta'`).

### M2. Missing `Origin` Header Permitted (`isOriginPermitted(null) === true`) Without `Sec-Fetch-Site` Guard
- **Locations:** `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-security.ts:104-105`, `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-auth.ts:42, 111`
- **Problem & Impact:** Unauthenticated `POST /api/beta/auth/login` and `/signup` have no CSRF token yet and rely solely on `isOriginPermitted`, which returns `true` when `Origin` is omitted.
- **Fix:** On state-changing `POST`/`DELETE` routes, reject `Sec-Fetch-Site: cross-site` unconditionally and require a non-null allowed `Origin` when `ENVIRONMENT === 'public-beta'`.

### M3. Unawaited Async `killSwitch.fire(...)` in Blocker C Gateway
- **Locations:** `/Users/macbook/algo-trader-poly-g5/src/desk/polymarket/poly-settlement-reconciliation-drills.ts:58, 72, 105, 135`
- **Problem & Impact:** `submitRiskGatedOrder` and `reconcileWithOnChainBalances` invoke async `killSwitch.fire(...)` via `void`, risking unhandled promise rejections if `cancelAll()` throws and preventing callers from awaiting cancel-all completion; `openPositions` (`line 72`) checks `v > 0` instead of `Math.abs(v) > 1e-6`, and `kill-cancel` (`line 58`) uses `Date.now()` instead of deterministic `nowMs`.
- **Fix:** Attach `.catch()` or expose async `await killSwitch.fire(...)` completion, count `Math.abs(v) > 1e-6`, and pass `nowMs`.

### M4. Per-File Coverage Below Plan AC #2 Target (`>=95%` stmts/lines/funcs, `>=85%` branches) on 5 New/Modified Modules
- **Locations:**
  - `src/desk/polymarket/clob-v2-order-transport.ts` (`80.0%` stmts, `53.84%` branches)
  - `src/desk/polymarket/clob-v2-order-verifier.ts` (`94.73%` stmts, `70.37%` branches)
  - `src/platform/poly-beta/tenant-paper-engine-actions.ts` (`85.0%` stmts, `71.42%` branches)
  - `src/platform/poly-beta/poly-beta-execution.ts` (`88.23%` stmts, `79.16%` branches)
  - `src/shared/polymarket/five-minute-crypto-guard.ts` (`88.23%` stmts, `71.11%` branches)
- **Impact:** Passes repo Hard Rule H10 (`>=80%`) in aggregate (`93.2%` stmts / `83.1%` branches), but falls short of `plan.md` AC #2 per-file targets and could pressure `quality-baseline.json` branch ratchet when full-repo coverage runs.
- **Fix:** Add negative tests for unsafe transport salt, malformed verifier signature catch branch, `MAX_EXPOSURE_CAP` / `INSUFFICIENT_CASH` / `INSUFFICIENT_POSITION` execution branches, and nested `target.markets` 5m guard recursion.

---

## LOW Priority Issues

### L1. `poly-beta-shell.tsx` Slightly Over 200-LOC Modularization Guideline & Unbounded Order ID Length in Cancel Regex
- **Locations:** `/Users/macbook/algo-trader-poly-g5/dashboard/src/poly-beta/poly-beta-shell.tsx` (`208` LOC), `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-mutations.ts:72`
- **Fix:** Extract summary stat cards from `poly-beta-shell.tsx` (`<=200` LOC) and bound cancel path regex to `/^\/api\/beta\/orders\/([A-Za-z0-9_-]{1,80})\/cancel$/`.

### L2. Unbounded Expired Session Accumulation in `beta_sessions`
- **Location:** `/Users/macbook/algo-trader-poly-g5/src/platform/poly-beta/poly-beta-auth.ts:141-146`
- **Fix:** Opportunistically prune expired rows on login: `DELETE FROM beta_sessions WHERE tenant_id = ? AND expires_at_ms <= ?`.

---

## Hard Rules H1–H11 & Brief Compliance Matrix

| Rule / Constraint | Verdict | Notes |
|---|---|---|
| `LIVE_TRADING_ENABLED=false` & zero real-money/keys | **PASS** | Enforced in `wrangler.poly-beta.toml:18`, `poly-beta-worker.ts:50-73`, `ci-gate-paper-gate-lock.sh` |
| Zero edits to `wrangler.toml`, `migrations/d1/*`, `cashclaw.cc` | **PASS** | `git diff` verified 0 lines changed |
| H1: Zero secrets / credentials | **PASS (minor path note)** | 0 secrets; remove `/Users/macbook/...` in `playwright.poly-beta.config.ts:5` (**H5**) |
| H2: Zero `eval` / `new Function` | **PASS** | Verified via ESLint + grep |
| H3: Feature branch (`feat/poly-g5-public-beta`) | **PASS** | Not on `main` |
| H4: Sanitized HTTP errors (no raw `err.message`/`stack`) | **FAIL** | Raw `err.message` leaked via `staleReason`/`detail`; missing Worker `try/catch` (**H2**) |
| H5: Strict Zod input validation | **PASS** | `.strict()` + `detectForbiddenCallerAuthorityOverride` enforced |
| H8 / H9: `tsc`, builds & tests green | **PASS (with caveat)** | Compiles & passes, but E2E spec is gitignored (**H5**) and 1 test hits live Gamma (**H4**) |
| H10: Coverage >= 80% | **PASS** | 93.20% stmts / 83.10% branches / 87.50% funcs / 94.86% lines (see **M4** for plan AC #2) |
| H11: Zero `:any`, zero `console.*` in `src/`, `src/*.ts <= 200` LOC | **PASS** | 0 `:any`, 0 `console.*` in `src/`; max `src/` file is 194 LOC |

---

## Prioritized Remediation Checklist

1. **(C1)** Fix `BUY` fee PnL accounting (`realizedDeltaMicro = -feeMicro`), enforce cash/exposure/position checks + matching on `PENDING` limit orders, and complete `settleSerializedPaperMarket` (`beta_fills`, `PENDING` cancel, drawdown refresh).
2. **(C2)** Align `buildClobV2TypedData` with `@polymarket/clob-client-v2` `ROUNDING_CONFIG[tickSize]`, default `domainVersion` to `'2'` on Polygon V2 contracts in `clob-v2-order-signing.ts` & `Poly1271SessionSigner`, and verify `signed.signedMessage` + `orderHash` + `nowSec >= exp` in `verifyClobV2SignedOrder`.
3. **(H1)** Fix cookie name to `'__Host-poly_beta_sid'` and reject `DEV_SESSION_COOKIE_NAME` over `https:`.
4. **(H2)** Add sanitized top-level `try/catch` in `poly-beta-worker.ts` & `TenantPaperEngine`, strip raw `err.message` from `staleReason`, wrap multi-table D1 writes in `db.batch([...])`, and make `GET /api/beta/portfolio` read-only.
5. **(H3 & H4)** Lock `HALTED` against `START`/`PAUSE`/`STOP` bypass on `max_drawdown_bps >= 500`, inspect `executeSerializedPaperOrder` return value in `runEngineStrategyStep`, differentiate the 3 paper strategies honestly, remove synthetic `$0.49/$0.51` fallback & timestamp laundering in `poly-beta-markets.ts`, and mock `fetch` in unit tests.
6. **(H5 & H6)** Un-ignore `!tests/e2e/poly-beta-first-user.spec.ts` in `.gitignore`, remove hardcoded `/Users/macbook/...` path in `playwright.poly-beta.config.ts`, and fix React `loadPortfolio` effect loop, `RUNNING` polling, and `SELL NO` / `Settle NO` controls.

---

## Unresolved Questions

1. Should `POST /api/beta/positions/settle` remain open to arbitrary user-chosen `winningOutcome` as an interactive sandbox drill (if so, should ledger/UI explicitly badge it `SIMULATED_DRILL` so simulated PnL cannot be mistaken for market-resolved PnL), or be restricted to upstream resolved markets only?
2. For `G11` (`HOLD`), will the 30-day continuous `poly-book` L2 capture run on an external Polygon-proximate Linux VPS streaming to R2 before Release B is reconsidered?
