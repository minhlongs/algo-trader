# POLY-G8.6 — Executive Decision & External Gate Status

**Date:** 2026-11-22  
**Repository:** `minhlongs/algo-trader`  
**Verified Engineering Baseline:** `87c8db9abe3fd9f480c0aee258e41a599e802c97`  
**Tracking Issues:** `#278` (Data Licensing), `#275` (Paper Beta Provenance), `#272` (IC Quant Research)  
**Authority Mode:** READ / VERIFY / PREPARE / DRAFT PR ONLY (`PRODUCTION = NONE`, `REAL_MONEY = NONE`)

---

## 1. Frozen Engineering Baseline Verification

All six POLY-G8.5 release-train PRs are verified `MERGED` into `main` at `87c8db9a`:

| Check | Status | Evidence |
|---|---|---|
| `main` HEAD equals `87c8db9a` | VERIFIED | `git rev-parse origin/main` = `87c8db9abe3fd9f480c0aee258e41a599e802c97` |
| PR `#288` (security deps) | MERGED | `951ddb0b6258` (`2026-11-21T11:51:09Z`) |
| PR `#282` (G8.2 sanitized dossier) | MERGED | `46aac024` |
| PR `#285` (offline evidence integrity) | MERGED | `e52190b4` |
| PR `#289` (StrategyRunner re-entrancy) | MERGED | `8586b374` |
| PR `#290` (lint warning cleanup) | MERGED | `45f26298` |
| PR `#291` (G8.4 IC release package) | MERGED | `87c8db9a` |
| Final `main` CI | SUCCESS | `CI` run `44907930483` (`success`), `Security Hardening & Attestation` run `44907930463` (`success`) |
| Unauthorized production deploy | NONE | Latest `poly-beta-api` version `9e73110c` (`2026-11-18T05:12:01Z`); `poly-beta-dashboard` `b65ede0e` (~`2026-11-18/19`); zero deploys since `87c8db9a` |
| Live collector process | NONE | Local `ps` check confirmed zero `poly-l2-collector` / collector processes running |
| Data rights & external legal signoff | UNRESOLVED | Zero signed Polymarket/ICE license; zero signed Vietnam counsel opinion |

---

## 2. Two-Objective Executive Decisions

### Objective A — IC Quant Research (`#278`, `#272`)
- **Decision:** **HOLD** on collection, VPS/R2 provisioning, and `IC_DAY_0` (`null`).
- **Why:**
  1. **Data Licensing (`#278`):** Polymarket Terms of Use (live-verified `2026-11-22`, effective `2026-08-11`, Adventure One QSS, Inc.) §4.2 restrict Capital Market Client data access (API, WebSocket, on-chain, raw, derived, aggregated, anonymized) without written permission. Ready-to-send inquiry covering all 12 required questions is prepared in [`01-DATA-LICENSE-INQUIRY.md`](./01-DATA-LICENSE-INQUIRY.md) (`DATA_LICENSE_OUTREACH = READY_FOR_FOUNDER_SEND`, unsent).
  2. **Vietnam Legal G12:** `LEGAL_G12 = HOLD`. Compact fixed-fee Vietnamese counsel request is prepared in [`03-VIETNAM-LEGAL-COUNSEL-REQUEST.md`](./03-VIETNAM-LEGAL-COUNSEL-REQUEST.md) (`QUOTE_REQUEST_READY`, unsent, zero paid engagement).
  3. **Infrastructure Economics:** Base steady-state projection is **$33.93/mo** (Conservative **$31.06/mo**, High-load **$59.32/mo**) pre-tax and pre-licensing, exceeding the `$30/mo` ceiling. Recommended Option **A now → B/D after Track A pricing** ([`04-VPS-R2-ECONOMICS-DECISION.md`](./04-VPS-R2-ECONOMICS-DECISION.md)).
  4. **Resolution Authority Trust Boundary:** Offline fail-closed 5-stage settlement verification boundary (`ChainSettlementProvider` + Ed25519-signed `SettlementVerificationReceipt` + public-key `TrustedSettlementVerifierRegistry`) implemented and adversarially tested in Draft PR `#292` (`fix/poly-g8-6-settlement-provenance`). **No live Polygon RPC verification has occurred** (`SETTLEMENT_CHAIN_VERIFIED = HOLD`); `w_skill = 0` remains locked until 150+ independently verified, finalized on-chain settlements pass all gates ([`05-RESOLUTION-AUTHORITY-TRUST-BOUNDARY.md`](./05-RESOLUTION-AUTHORITY-TRUST-BOUNDARY.md)).

### Objective B — First External Customer (`USER_001`, `#275`)
- **Decision:** **`USER_001_INVITE = HOLD`**.
- **Why (Verified Read-Only Cloudflare & Live Evidence):**
  1. **Stale & Unattributable Deployment:** Active `poly-beta-api` Worker (`9e73110c-4a8f-4587-869c-59085ee7ec55`, `2026-11-18`) and `poly-beta-dashboard` Pages (`b65ede0e-ecfd-4e3a-a9a0-65c1612eab60`, manual upload) both **predate security PR `#288`** (`2026-11-21`). Neither embeds a verified commit SHA (`PAPER_BETA_DEPLOYED_SHA = UNKNOWN`, `PAPER_BETA_DEPENDENCY_PROVENANCE = UNKNOWN`).
  2. **Reachable Unpatched Auth Dependency:** `poly-beta-dashboard` imports `better-auth/react` (`dashboard/src/lib/auth-client.ts:6`); at `558adee1` (pre-PR `#288`), `package-lock.json` pinned `better-auth@1.6.29` (patched to `1.7.7` in `#288`).
  3. **Two Runtime Product-Gate Gaps:** (a) `handleBetaSignup` (`src/platform/poly-beta/poly-beta-auth.ts:40-115`) enforces IP rate limiting (`10/60s`) only, with **no private signup allowlist**; (b) `poly-beta-dashboard.pages.dev` HTML metadata/JSON-LD still advertises commercial CashClaw paid tiers (`$49/mo Pro`, `$199/mo Enterprise`, `"non-custodial CLOB bot"`).
  4. **Verified Safety Controls Still Intact:** `LIVE_TRADING_ENABLED="false"`, zero CLOB signing keys in Worker secrets, HTTP 403 `REAL_MONEY_OPERATIONS_DISABLED` on `/api/beta/deposit`, isolated D1/KV/DO bindings, sticky `HALTED`, `$100` virtual equity.
  - Full audit and proposed safe release-candidate checklist: [`02-PAPER-BETA-DEPLOYED-PROVENANCE.md`](./02-PAPER-BETA-DEPLOYED-PROVENANCE.md).

---

## 3. Gate Summary Matrix

| Gate | Status | Blocking Dependency |
|---|---|---|
| `DATA_LICENSE_OUTREACH` | `READY_FOR_FOUNDER_SEND` | Founder identity fields + verified email dispatch |
| `DATA_LICENSE_PERMISSION` | `HOLD` | Written Polymarket / ICE authorization |
| `PAPER_BETA_DEPLOYED_SHA` | `UNKNOWN` | Reproducible CI deploy pinning `COMMIT_SHA` |
| `PAPER_BETA_DEPENDENCY_PROVENANCE` | `UNKNOWN` | Rebuild from `>= 87c8db9a` lockfile (`better-auth@1.7.7`, `proxy-addr@2.0.8`) |
| `PAPER_BETA_SECURITY` | `HOLD` | Rebuilt Pages + Worker, signup allowlist, Paper Beta disclosure HTML |
| `USER_001_INVITE` | `HOLD` | `PAPER_BETA_SECURITY = PASS` + Founder deploy approval |
| `LEGAL_G12` | `HOLD` | Independent licensed Vietnamese counsel written opinion |
| `INFRA_BUDGET` | `HOLD` | Track A licensing quote + Founder budget ceiling decision |
| `VPS_R2_ACTIVATION` | `HOLD` | `DATA_LICENSE_PERMISSION` + `LEGAL_G12` + `INFRA_BUDGET` |
| `IC_DAY_0` | `null` | All [`06-IC-DAY0-ACTIVATION-CHECKLIST.md`](./06-IC-DAY0-ACTIVATION-CHECKLIST.md) gates |
| `ECONOMIC_G11` / `FOUNDER_G13` | `HOLD` | 30-day lawful empirical evidence |
| `REAL_MONEY_TRADING` | `DISABLED` | Permanent non-negotiable lock |

---

## 4. Document Index

1. [`00-G8-6-EXECUTIVE-DECISION.md`](./00-G8-6-EXECUTIVE-DECISION.md) — Executive summary & gate matrix
2. [`01-DATA-LICENSE-INQUIRY.md`](./01-DATA-LICENSE-INQUIRY.md) — Track A Polymarket/ICE terms verification & 12-question inquiry
3. [`02-PAPER-BETA-DEPLOYED-PROVENANCE.md`](./02-PAPER-BETA-DEPLOYED-PROVENANCE.md) — Track B read-only Cloudflare provenance & security audit
4. [`03-VIETNAM-LEGAL-COUNSEL-REQUEST.md`](./03-VIETNAM-LEGAL-COUNSEL-REQUEST.md) — Track C Vietnam G12 statutory verification & fixed-fee counsel brief
5. [`04-VPS-R2-ECONOMICS-DECISION.md`](./04-VPS-R2-ECONOMICS-DECISION.md) — Track D cost reconciliation & Options A–E decision matrix
6. [`05-RESOLUTION-AUTHORITY-TRUST-BOUNDARY.md`](./05-RESOLUTION-AUTHORITY-TRUST-BOUNDARY.md) — Track E authoritative settlement provenance trust boundary
7. [`06-IC-DAY0-ACTIVATION-CHECKLIST.md`](./06-IC-DAY0-ACTIVATION-CHECKLIST.md) — Sequential Day 0 activation gates & rollback criteria
8. [`07-FOUNDER-AUTHORIZATION-REQUESTS.md`](./07-FOUNDER-AUTHORIZATION-REQUESTS.md) — Bounded Founder sign-off items (no unilateral actions taken)
