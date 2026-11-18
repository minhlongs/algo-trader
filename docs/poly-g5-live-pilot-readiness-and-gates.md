# POLY-G5 Disabled $100 Live-Pilot Design, Legal/Economic Reviews & Gates G0–G13 Matrix

- **Date:** 2026-11-15
- **Live Trading Status:** **STRICTLY DISABLED (`LIVE_TRADING_ENABLED=false`)**

---

## 1. Phase 5 — Disabled $100 Live Pilot Design & Legal / Risk Assessment

### 1.1 Legal & Eligibility Gate (`G12 = HOLD`)
- **Operator & First-User Context:** Operator / first user operates from **Vietnam** without formal external legal counsel sign-off on prediction-market or digital-asset trading services.
- **Regulatory & Platform Distinctions:**
  - **Research / Paper Simulation Software (Release A):** Zero customer funds, zero wallets, zero order transmission to any venue, public read-only market observation only.
  - **Non-Custodial Trading Software vs Broker / Managed Service / Custodian (Release B):** Executing live orders on behalf of third-party users, holding session signing keys on server infrastructure, or pooling funds crosses into regulated brokerage / managed-trading / VASP / derivatives territory in multiple jurisdictions and requires explicit Polymarket Terms of Use & geographic eligibility verification.
  - **Strict Anti-Circumvention Rule:** Non-blocked IP reachability is **not** legal authorization. VPNs, proxies, or geographic routing to bypass Polymarket restrictions are strictly prohibited.
- **Gate G12 Verdict:** **`HOLD` (BLOCKED FOR LIVE PILOT)** until written independent legal clearance confirms operator & participant eligibility, licensing posture, AML/KYC obligations, and Polymarket Terms compliance.

### 1.2 Strictly Non-Custodial Funding & Signing Architecture (Prepared, Not Activated)
- **Zero Pooled Custody:** Customer funds must never enter an owner-controlled wallet, shared treasury, or pooled PnL ledger. Administrator accounts have zero withdrawal authority.
- **Delegated Session Key Specification (`Poly1271SessionSigner`, Disabled):**
  - User retains exclusive ownership of their ERC-1967 / EIP-1271 Deposit Wallet (`maker`, `signatureType = 3`).
  - Owner/master private key is hardware/wallet-resident and hard-rejected in runtime (`MASTER_KEY_FORBIDDEN_IN_RUNTIME`).
  - If delegated session signing is ever authorized in the future: (a) scoped strictly to EIP-712 `Order` structs on `0xE111180000d2663C0091e4f400237545B87B996B` / `0xe2222d279d744050d28e00520010520000310F59` (raw L1/L2 tx signing throws), (b) bounded pUSD ERC-20 allowance (`--amount-pusd 100`, never `MaxUint256`), (c) mandatory `sessionExpiresAtSec` TTL (`<= 24h`), and (d) instant on-chain session revocation by the user. **No delegated signing capability is created or activated.**

### 1.3 Candidate $100 Risk Envelope vs Venue Minimums & IC Deviation
- **Candidate Limits Evaluated:** Capital `$100`, max portfolio exposure `$20`, max single order `$5`, daily loss stop `$3`, cumulative drawdown stop `$5` (`5.0%`), zero leverage, zero 5m Crypto markets, post-only preferred, zero martingale/averaging down, automatic halt on stale data / risk / settlement drift.
- **Feasibility vs `MIN_RESTING_ORDER_SHARES = 5`:**
  - At `5` minimum resting shares, notional is `5 * price`. For `price <= $0.99`, minimum order notional is `$0.05 – $4.95 <= $5.00`. Thus a `$5.00` single-order ceiling is **mechanically feasible** for a single 5-share lot across `[0.01, 0.99]`, though at prices `> $0.50` only `5–9` shares can be quoted per order and at most `4` concurrent `$5` positions fit inside the `$20` exposure cap.
- **IC Deviation Record (`$100` vs IC `2,500–5,000 pUSD`):**
  - The IC specifies `2,500–5,000 pUSD` for a statistically meaningful multi-market micro-pilot. A `$100` envelope (`$5` max order) is **strictly an operational end-to-end smoke test** of EIP-712 signing, post-only submission, fee accounting, GhostGuard monitoring, and CTF settlement reconciliation — **it is NOT a statistically valid proof of positive alpha**.

---

## 2. Phase 6 — Economic Validation Report (`G11 = HOLD / UNKNOWN`)

Measured directly via `npm run kpi:poly -- --days 30 --record-ms 0 --json`, `npm run kpi:poly -- --days 30 --record-ms 0 --stress --json`, and `npm run poly:governance -- --json` on `2026-11-15T06:06:29Z`:

- **Anti-Lookahead & Backtest Integrity Audit (`poly:governance`):** **PASS** (`244` files scanned, `0` findings across `SYNTHETIC_FEED_IN_OBSERVED_PIPELINE`, `LOOKAHEAD_FUTURE_PEEK`, `MISSING_FEE_SCHEDULE_ACCOUNTING`, `MISSING_FIVE_MINUTE_CRYPTO_EXCLUSION`, `UNSANITIZED_MARKET_ANCHOR_PROMPT`; `10/10` canonical upstream repos tracked).
- **Observed Sample Sizes & Strategy Branch Evidence:**
  - Point-in-time recorded L2 `poly-book` WAL segments (`recordedL2Steps`): **`0` steps (`0` days < required `30` days)** → **`UNKNOWN`**.
  - Historical coarse snapshots (`pricesHistoryRows = 970`, `dataApiV2Trades = 240`, `snapshotCount = 168`): `0` closed live/shadow maker cycles (`< 500` qualifying simulated fills required).
  - **Market Making (`ToxicityAwareMarketMaker`):** 60s realized spread + rebates + rewards over `>= 500` fills = **`UNKNOWN`** (`0` qualifying L2 queue-conservative fills recorded over 30d).
  - **NegRisk Bundle Arbitrage:** Complete-basket fill rate & leg decay over 30d L2 = **`UNKNOWN`** (`0` 30d L2 WAL segments).
  - **AI / Market-Blind Fair-Value Branch:** Resolved prospective out-of-sample sealed forecasts = **`0 / 150` required (`UNKNOWN`)**; `evaluateSkillGate` keeps `w_skill = 0` locked.
  - **1.5x Execution-Cost Stress & -50% Liquidity Reward Haircut (`--stress`):** Configured and verified (`slippageCancelLatencyMultiplier = 1.5`, `liquidityRewardHaircutFraction = 0.5`, `annualLockedCapitalCarryRate = 0.045`), net PnL 95% bootstrap CI lower bound = **`UNKNOWN`** pending `>= 30d` L2 capture.
- **Gate G11 Verdict:** **`HOLD` (`UNKNOWN` sample coverage — green CI does NOT prove positive alpha).**

---

## 3. Phase 7 — Independent Acceptance Gates (G0–G13)

| Gate | Requirement | Evidence | Status |
|---|---|---|---|
| **G0** | Repo & deployment baseline verified | Commit `b778f53a`, PR `#270`, `#271`, `#272`, CF inventory in `docs/poly-g5-forensics-and-boundary-matrix.md` | **PASS** |
| **G1** | Cloudflare architecture & route isolation verified | `wrangler.poly-beta.toml` (`name = "poly-beta-api"`, `routes = []`), isolated `poly-beta-dashboard`, `poly-beta-db`, `POLY_BETA_KV`, `TenantPaperEngine` | **PASS** |
| **G2** | Build, typecheck & CI gates clean | `tsc --noEmit`, `build:worker`, `disk:check`, `dashboard` build, `vitest`, `ci-gate-secret-scan`, `ci-gate-paper-gate-lock`, `check-quality-baseline` | **PASS** |
| **G3** | Auth & multi-tenant security PASS | `__Host-poly_beta_sid; HttpOnly; Secure; SameSite=Lax; Path=/`, SHA-256 session hash, CSRF + same-origin `Origin`/`Sec-Fetch-Site` guard, DO atomic rate limit + HMAC proxy IP verification, User A vs User B adversarial tests (`tests/poly-beta/`) | **PASS** |
| **G4** | Paper trading order & portfolio accounting PASS | Integer micro-USD ledger (`GENESIS_GRANT`, `ORDER_FILL`, `SETTLEMENT_PAYOUT`), separated Realized / Unrealized / Settled PnL, idempotency | **PASS** |
| **G5** | Kill switch & GhostGuard drills PASS | `cmdDrillGhost` with compiled Rust `ghostguard` binary (`74.35ms < 100ms`, `0` orphan PIDs) + heartbeat deadman drill | **PASS** |
| **G6** | EIP-712 offline compatibility PASS | Byte-for-byte parity with `@polymarket/clob-client-v2` `OrderBuilder` + `orderToJsonV2`, golden vectors, bad sig/signer/chain/nonce/expiry tests (`#272`) | **PASS** |
| **G7** | Data ingestion & recovery tests PASS | `poly-book` WAL v3 CRC32C codec + stale/500/unreachable feed fail-closed `HALTED` tests | **PASS** |
| **G8** | Browser E2E & mobile UX PASS | Playwright Desktop Chromium + Mobile Pixel 5 E2E suite & fresh screenshots (`2 passed`, `tests/e2e/poly-beta-first-user.spec.ts`) | **PASS** |
| **G9** | Zero production route, DB or key changes | Pre/post verification of `cashclaw.cc`, `quant.cashclaw.cc`, `api.cashclaw.cc`, `wrangler.toml`, and prod D1 (`0` diff, HTTP `200`) | **PASS** |
| **G10** | Public beta deployment smoke tests PASS | Live smoke against deployed `poly-beta-api` (`9e73110c-4a8f-4587-869c-59085ee7ec55`) + `poly-beta-dashboard` (`b65ede0e`) | **PASS** |
| **G11** | Economic validation with actual sample sizes | `0/30` days L2 WAL, `0/500` maker fills, `0/150` OOS forecasts reported honestly as `UNKNOWN` | **HOLD** |
| **G12** | Independent legal readiness review | Vietnam operator/user context lacks external legal opinion & venue eligibility sign-off | **HOLD** |
| **G13** | Founder authorization for real capital | Exclusive founder approval not granted (and blocked behind G11 + G12) | **HOLD** |

## Unresolved Questions
- External legal sign-off (`G12`), 30-day continuous point-in-time L2 WAL collection (`G11`), and explicit Founder real-capital sign-off (`G13`) remain prerequisites before Release B can ever move from `HOLD`.
