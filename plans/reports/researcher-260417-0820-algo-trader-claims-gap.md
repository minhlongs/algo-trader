---
name: Algo-Trader Claims vs Shipped Reality Gap Analysis
description: Product promises verification against live code/deployment 2026-04-17
type: report
---

# Algo-Trader Claims vs Shipped Reality Gap Analysis

## Product Claims (README + Manifesto)

| Claim | Status | Evidence |
|-------|--------|----------|
| **52+ strategies** across 5 prediction markets | INFLATED | 48 .ts files in `src/strategies/polymarket/`; README badge says "33 polymarket" |
| **46 Polymarket strategies specifically** (old memory) | OBSOLETE | Current: 33 (per README), actual code count 48 total (includes CEX/DEX/GRU) |
| **150 paper trades, 14.6% edge** (manifesto) | STALE | Paper trading stopped after Phase 2; manifesto frozen 2026-04-16; no current runs documented |
| **66.7% win rate on 50 trades** (README) | STALE | Paper phase ended; changelog shows "paper trading works" but no current live edge data |
| **Dual-model AI prediction** (Nemotron + DeepSeek R1) | SCAFFOLDED | Code references exist in README/changelog; actual integration wiring incomplete (deferred to Phase 3 D1 sync) |
| **Telegram trading alerts** | SHIPPED | TelegramAlertBot + TradingAlertsTelegram in codebase; active in Phase 7 |
| **Cloudflare Pages deployment** | SHIPPED | quant.cashclaw.cc reachable; returns HTML from CF Pages |
| **Better Auth integration** | SHIPPED | PR #98 merged (2026-04-15); session guard + secret validation active |
| **A16Z dual-layer positioning shipped** | PARTIAL | Phase 01-02-04 merged (PR #100); Phase 03 D1 live sync still pending (PR #104 merged but flagged as in-flight) |
| **Polar.sh + NOWPayments billing** | MIGRATED | v1.1.1 removed Polar, now NOWPayments USDT TRC20 only; v2.0.0 bypasses Polar for enterprise (invoice) |
| **CI green, 570 tests passing** | BROKEN | Latest CI run (2026-04-17 01:13) FAILED; dashboard missing @testing-library/react; 3 test files import but dep uninstalled |
| **D1 nightly sync cronjob** | CLAIMED NOT CONFIRMED | Scripts exist (`generate-weekly-draft.ts`, `generate-monthly-milestone.ts`); PR #105 fixes weekly query; no verification that cron actually runs |
| **Enterprise tier shipped** | CODE-ONLY | PR #106 OPEN (not merged); 7 phases in code but NOT in production; invoice model ($49k/$199k/$499k) scaffolded only |
| **BYOK + Citadel attestation** | CODE-ONLY | PR #106 contains all 11 Citadel files; simulation mode only (real SGX/TDX deferred); not yet merged |

---

## Shipped Evidence

### Code Review Snapshot (as of commit 7ab73f8)

**Backend tsc:** 2 TS errors (signal-subscription-routes.ts, signal-feed-routes.ts) — Router type narrowing needed.

**Dashboard tsc:** 0 errors reported in PR #106 body, but vitest suite fails because:
- @testing-library/react added to deps (commit d68665a) but **not installed** (pnpm install missing)
- Dashboard test files exist (3 new) with broken imports
- Phase 06-07 UI tests cannot run

**GitHub Actions CI:**
- **Latest run:** 2026-04-17 01:13 — FAILURE (Install dependencies step failed)
- **Previous success:** 2026-04-16 15:43 (manifesto + dual-layer Phase 02-04 landing)

**Prod deploy:** 
- URL quant.cashclaw.cc is live and returns 200
- Content: React HTML shell (no data endpoints visible from static page)
- Manifesto route confirmed in code; Phase 02 landing shipped

---

## Gaps Ranked by Revenue Impact

### 🔴 Critical (Blocks monetization)

1. **Enterprise Tier Not Live** — $49k/$199k/$499k invoice tier exists in code (PR #106) but unmerged, undeployed
   - Citadel Protocol: simulation mode only (real attestation deferred)
   - Enterprise inquiry form & TAM dashboard: scaffolded, no persistence
   - Revenue model: NOT OPERATIONAL

2. **CI Broken** — Dashboard tests uninstallable; blocks all deployments
   - Missing pnpm install for @testing-library/react
   - Cannot merge or deploy until fixed
   - SLA: 5+ hours of blocking time

3. **A16Z Phase 03 D1 Live Sync Pending** — Promised "nightly D1 sync" in manifesto
   - PR #104 merged but commit message says "in-flight"
   - Real-time trade data → D1 sync chain incomplete
   - **Revenue impact:** Paper-to-live transition depends on this

### 🟡 High (Limits current tier)

4. **52+ Strategies Claim Overstated** — README badge: "33 polymarket", actual files: 48 total
   - 33 Polymarket-specific (verified)
   - 15 CEX/DEX/ML (GRU, QL-Learning, Kronos, triangular funding-rate arb)
   - Claim: inflated wording; reality: diversified

5. **Paper Trading Stats Frozen** — "150 trades, 14.6% edge" in manifesto dated 2026-04-16
   - No current live results published
   - Phase 2 condition: "55% live hit rate clears before activation"
   - Status: NOT YET ACTIVATED (manifesto says "$500 conditional live capital")

6. **Dual-Model Inference Not Wired** — README claims Nemotron (scanner) + DeepSeek R1 (estimator)
   - README documents .env setup (OPENCLAW_GATEWAY_URL, OPENCLAW_SCANNER_URL)
   - Code references (ChatGPT, LlmRouter) exist; actual routing NOT implemented
   - Phase 3 D1 sync depends on this

### 🟢 Medium (UX issues)

7. **Better Auth: Incomplete Rollout** — PR #98 merged; MFA/passkeys NOT shipped
   - Session guard + secret validation only
   - Full auth flow (passwordless, TOTP, WebAuthn) scaffolded only

8. **Telegram Bot Commands Not Verified** — 9 commands documented; actual runtime status unknown
   - /faq, /support, /pricing exist
   - No smoke test evidence of working Telegram integration

---

## Production Health Check

| Component | Status | Notes |
|-----------|--------|-------|
| **Prod URL** | ✅ 200 OK | quant.cashclaw.cc returns HTML |
| **Latest CI** | ❌ FAILURE | 2026-04-17 01:13 (Install deps failed on PR #106) |
| **Prev CI** | ✅ SUCCESS | 2026-04-16 15:43 (manifesto landing) |
| **Main branch** | ✅ GREEN | Manifesto + Phase 02-04 + Better Auth merged |
| **PR #106 (Enterprise)** | ❌ BLOCKED | 7 phases code-complete, CI broken, not mergeable |
| **Tests (local)** | ⚠️ PARTIAL | 789 passing, 3 dashboard test files broken (missing @testing-library/react in PATH) |
| **Dashboard deploy** | ✅ LIVE | algo-trader-dashboard.pages.dev deployed (older commit, pre-Phase-06) |

---

## Pending Milestones

### A16Z Phase 03: Live D1 Sync (CLAIMED MERGED, NEEDS VERIFICATION)

**Status:** PR #104 shows merged, commit message says "in-flight"
- Route: `/api/stats/live-d1` querying D1 nightly
- Execution: LaunchD plist triggers weekly/monthly drafts
- **Risk:** Scripts query wrong schema (`paper_trades_v3` vs `trades`); PR #105 fixed schema mismatch

**Action required:** Verify D1 query routes actually respond with real data

### RaaS Solo-Platform Post-Merge (BLOCKED)

**PR #106 status:** OPEN, 30 commits, CI broken
**Deferrals (post-merge):**
- H1: Enterprise inquiry store in-memory → Postgres migration
- H2: Subscriber P&L dashboard vitest wiring (jsdom config pending)
- H3: Citadel real TEE quote validation (currently simulation mode only)
- Wasm: 45 remaining strategies port-on-demand (1 PoC kernel live)
- IronClaw: wire DLP egress filter into order-executor + sentiment-feed

---

## Open Questions

1. **Is D1 nightly sync actually running?** — PR #104 says merged but "in-flight". No cron verification in codebase.
2. **Paper trading stopped when exactly?** — Manifesto says "150 trades completed" but no timestamp. When did Phase 2 validation end?
3. **Live capital activated?** — Manifesto: "conditional on 55% hit rate". Did that threshold clear? Is $500 live now?
4. **Which Polymarket strategies are actually active?** — 33 exist in code; which ones run in production (algo monitor)?
5. **Citadel: when moving to real SGX/TDX?** — Currently simulation mode. Hardware attestation deferred to D2 (when?).
6. **Enterprise tier: when shipping?** — PR #106 blocked on CI. ETA to merge + deploy to prod?
7. **Dashboard install fix ETA?** — @testing-library/react missing. 5+ hour blocker. Fix PR in flight?
8. **Polar account status?** — Removed from code v1.1.1 → NOWPayments. Is Polar billing still referenced anywhere?
9. **"Better Auth" incomplete?** — PR #98 merged but README doesn't document MFA/passkeys. Are those shipped or scaffolded?
10. **Paper-stats.json stale?** — Last updated 2026-04-16. When next refresh? Still 150 trades or updated batch 4?
