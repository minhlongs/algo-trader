# POLY-G10.5 — Global-First Strategic Rebaseline & 5-Gate Governance Reconciliation

**Date:** 2026-11-24  
**Baseline (`origin/main`):** `3d4977c2c42a4f02726ce4aed0114573e376b454`  
**Preserves Historical Records:** [`09`](./09-DATA-LICENSE-DECISION-PACK.md), [`10`](./10-LEGAL-G12-COUNSEL-BRIEF.md), [`11`](./11-COLLECTOR-BUDGET-OPTIONS.md), [`12`](./12-IC-DAY0-ENTRY-CONTRACT.md) (zero audit erasure)  
**Companion Matrix:** [`docs/poly-g10/14-JURISDICTION-AND-RESEARCH-RIGHTS-MATRIX.md`](./14-JURISDICTION-AND-RESEARCH-RIGHTS-MATRIX.md)  
**Code Authority:** [`src/desk/polymarket/venue-eligibility.ts`](../../src/desk/polymarket/venue-eligibility.ts), [`src/platform/poly-beta/poly-beta-jurisdiction-gate.ts`](../../src/platform/poly-beta/poly-beta-jurisdiction-gate.ts)

---

## 1. Strategic Rebaseline Configuration

`POLY ALPHA HUNTER` is an **international-first** quantitative research and trading-technology project. Vietnam is **not** a target customer market, and a Vietnam-specific legal counsel engagement is no longer treated as a blanket prerequisite for pure offline clean-room engineering or non-Vietnam jurisdictions.

```text
TARGET_MARKET=INTERNATIONAL
TARGET_VIETNAM_CUSTOMERS=false
PRODUCT_LANGUAGE=en
ACCOUNTING_CURRENCY=USD
PRIMARY_VENUE=POLYMARKET_INTERNATIONAL
LEGAL_FRAMEWORK=JURISDICTION_AWARE
```

> **Compliance Red Line:** This rebaseline is **never** permission to evade geographic restrictions, spoof location, route traffic via VPN/proxy/nominees, or disregard domestic law applicable to the actual human operator, physical operating location, or legal entity.

---

## 2. Five Activity-Scoped Governance Gates (Replaces Blanket `VIETNAM_G12`)

Applicability and pass/hold conditions are evaluated independently per activity (`evaluatePolymarketVenueEligibility` in `src/desk/polymarket/venue-eligibility-evaluator.ts`). Unresolved legal or contractual requirements **never** evaluate to `PASS`.

| Scoped Gate | Scope & Activity | Applicable Prerequisites | Current Status | Required Artifact to Advance |
|---|---|---|---|---|
| `OFFLINE_ENGINEERING` | Local clean-room Rust/TS code, deterministic synthetic fixtures, math/fee/settlement/scorecard tests (zero external market-data egress, zero order signing) | Clean-room IP compliance (`07-LICENSE-UPSTREAM-AND-PROVENANCE.md`), zero VPN/circumvention code | **`PASS`** | Verified on `3d4977c2` + `#POLY-G10.5` unit/adversarial test suite |
| `RESEARCH_DATA_RIGHTS` | Automated 150-market L2 WS/REST capture, 30–90d WAL/Parquet retention on VPS + private R2, or customer-facing market-data display | Written Polymarket (`Adventure One QSS, Inc.`) and/or ICE Data Services clearance for the actual operator classification | **`HOLD`** (`DATA_LICENSE=HOLD`) | Signed/written Polymarket or ICE permission covering exact requested scopes |
| `INTERNATIONAL_PRODUCT_ELIGIBILITY` | English-first, USD virtual-only (`$100`) Paper Beta for enrolled international researchers (zero deposits, zero custody, zero user trade execution, zero guaranteed returns) | Code EN-first + fail-closed geo-gate (`VN`, OFAC & Polymarket restricted excluded) **AND** Cloudflare B0 private Access closure **AND** data-display clearance (if live Polymarket feed enabled) | **`HOLD`** (code `READY`; `B0=PARTIAL_OR_HOLD`, `DATA_LICENSE=HOLD`, no deploy/invite) | Two Founder-only Cloudflare Access apps verified (`08-B0-FOUNDER-ACTION-GATE.md`) + written data-display clearance + applicable product-law check |
| `OPERATOR_JURISDICTION_ELIGIBILITY` | Actual operator citizenship/residency, physical operating location, legal entity jurisdiction, and principal place of business | Verified non-restricted status across Dimensions 1–4 & 6–7 **AND** compliance under domestic laws governing the actual operator/entity | **`UNKNOWN`** (`HOLD`) | Founder records verified operator/entity jurisdiction profile externally + obtains applicable local legal clearance where required |
| `LIVE_TRADING_ELIGIBILITY` | Any real-money wallet funding, `pUSD` approval, EIP-712 live order submission, or Relayer V2 settlement | `OPERATOR_JURISDICTION_ELIGIBILITY=PASS` + `VENUE_ELIGIBILITY=ELIGIBLE` + `RESEARCH_DATA_RIGHTS=PASS` + `ECONOMIC_G11=GO` + `FOUNDER_G13=GO` + Issue `#272` live signing parity | **`DISABLED`** (`LIVE_TRADING_ENABLED=false`, `REAL_MONEY_TRADING=DISABLED`) | All 5 upstream gates `PASS`/`GO` + 30d L2, 500 maker fills, 150 finalized OOS resolutions |

---

## 3. International Paper Beta Scope (Phase 3 Verification)

- **Positioning:** English-first (`DEFAULT_BETA_LANG = 'en'`), USD accounting (`$100.00` virtual grant, `$0` real value), international research audience (`TARGET_VIETNAM_CUSTOMERS=false`).
- **Hard Financial Non-Custody Boundaries:** Zero customer deposits, zero withdrawals, zero custody, zero wallet/seed collection, zero trade execution on behalf of users, zero guaranteed investment returns (`REAL_MONEY_BLOCKED_PATTERNS` → `403 REAL_MONEY_OPERATIONS_DISABLED`).
- **Jurisdiction-Aware Onboarding (`poly-beta-jurisdiction-gate.ts`):** Rejects `VN` customer signups, OFAC complete-block territories (`CU, IR, KP, SY, UA-09, UA-14, UA-43`), Polymarket API/Frontend restricted territories (`US, UM, GB, FR, DE, SG, AU, CA-AB/BC/ON/QC`, etc.), Tor/anonymizer headers (`T1`/`XX`), missing non-VPN attestations, and declared-vs-edge country mismatches.
- **Cloudflare B0 & Zero-Egress Preserved:** `wrangler.poly-beta.toml` retains `workers_dev = false`, `preview_urls = false`, `routes = []`, `MAINTENANCE_MODE = "true"`, `MARKET_DATA_ENABLED = "false"`, `LIVE_TRADING_ENABLED = "false"`. Zero deployments or user invitations executed.

---

## 4. Unchanged PDF Quant Roadmap & Scientific Evidence Floors (Phase 5)

The global-first rebaseline changes market positioning and legal scoping **only**; zero quantitative standards are weakened:

1. **Five Upstream Integration Targets Preserved (`07-LICENSE-UPSTREAM-AND-PROVENANCE.md`):**
   - `NautilusTrader` (architectural reference; clean-room TS/Rust avoids LGPL-3.0 copyleft)
   - `Poly-book` (re-implemented in `sidecars/poly-book/` with CRC32C WAL & Parquet)
   - `Poly-maker` (replaced cleanly by V2 `pUSD` / `Poly1271` / toxicity-aware MM; zero V1 plaintext key patterns)
   - `GhostGuard` (re-implemented in `sidecars/ghost-guard/` + synchronous `<100ms` kill-switch bridge)
   - `Predict-raven` (replaced by SHA-256 hash-chained market-blind prospective ledger + finalized on-chain CTF settlement verifier)
2. **Three Alpha Hypotheses Preserved:**
   - **A:** Toxicity-Aware Adaptive Maker-Only Market Making (`log-odds-avellaneda-stoikov-mm.ts` + `liquidity-regime-machine.ts`)
   - **B:** Event-Level NegRisk / Combinatorial Rebalancing (`negrisk-bundle-arbitrage-*.ts` + fail-closed `eth_call` preflight)
   - **C:** Primary-Source News Latency / Market-Blind Shrunk Fair-Value (`primary-source-news-latency.ts` + `market-blind-*`, `W_SKILL = 0`)
3. **Immutable Quantitative & Governance Locks:**
   - `MIN_RECORDED_L2_DAYS = 30` | `MIN_QUALIFYING_MAKER_FILLS = 500` | `MIN_RESOLVED_OOS_FORECASTS = 150`
   - Stationary block bootstrap 95% CI LB `> 0`, Sortino `>= 2.0`, Deflated Sharpe `>= 1.5`
   - Queue-aware execution (`100%` back-of-queue, log-normal cancel flight), 5-decimal CLOB V2 quadratic fees, `1.5x` slip/cancel & `-50%` reward & `+0.5¢` shocks, finalized Polygon CTF settlement provenance
   - `IC_DAY_0 = null` | `W_SKILL = 0` | `ECONOMIC_G11 = HOLD` | `FOUNDER_G13 = HOLD` | `LIVE_TRADING_ENABLED = false` | `REAL_MONEY_TRADING = DISABLED`
