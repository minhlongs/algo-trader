---
title: "Solo-Platform B2B RaaS Upgrade (algo-trader)"
description: "Layer Citadel+Wasm+IronClaw+BYOK+CEX+Signal API+Subscriber P&L+Enterprise tier on top of existing algo-trade RaaS"
status: "DONE (all 7 phases shipped)"
priority: P1
effort: 7 phases / 7 shipped
branch: plan/raas-solo-platform-260416
completed: 2026-04-17
tags: [raas, solo-platform, enterprise, byok, multi-tenant, citadel, wasm]
created: 2026-04-16
---

# Solo-Platform RaaS Upgrade — Overview

**Goal:** Upgrade algo-trader into enterprise-grade B2B RaaS per Solo-Platform doctrine (PDF Giai Doan 1-3 core, 4 deferred). Tier $49k-$499k. BYOK + zero data egress + per-subscriber sandbox.

**Thesis:** Reuse 46 Polymarket strategies + Better Auth + license gating + billing + D1 sync + React dashboard. Build-new: security perimeter (Citadel/Wasm/IronClaw), CEX adapter, signal feed API, multi-tenant analytics, enterprise onboarding. K8s = OUT-OF-SCOPE (prototype only, deferred).

**Non-conflict:** Active plan `260416-1213-chinh-danh-a16z-dual-layer` is 3/4 shipped (manifesto/dashboard/D1/polymarket). This plan layers orthogonally — no file overlap.

## Phases

| # | Phase | Files | Tests | Commit | Status |
|---|---|---|---|---|---|
| 01 | Citadel Protocol MVP (attestation stub + BYOK KMS wrap) | 11 | 16/16 | a619c50→3055064 | ✓ DONE |
| 02 | Wasm Sandbox (per-subscriber exec isolation) | 15 | 31/31 | 8f67a80→cf6277b | ✓ DONE |
| 03 | IronClaw DLP (outbound filter + audit log) | 11 | 18/18 | e150338→d3e1934 | ✓ DONE |
| 04 | CEX adapter (Binance spot + dYdX v4 read-only) | 8 | 37/37 | 03042ec (merge) | ✓ DONE |
| 05 | Signal feed API (REST + SSE + Telegram) | 16 | 26/26 | 4e82016 (merge) | ✓ DONE |
| 06 | Subscriber P&L dashboard (multi-tenant lens) | 20 | 25/25 | 6b089ad→db1eb48 | ✓ DONE |
| 07 | Enterprise tier + onboarding ($49k-$499k invoice) | 11 | 19/19 | e1bff1a→0b0ed8e | ✓ DONE |

**Totals:** ~92 files, 211/211 backend tests pass, tsc clean backend + dashboard. Dashboard vitest runtime deferred.

**K8s operator** intentionally excluded (YAGNI for MVP). Document as future Giai Doan 4.

## Dependency Graph

```
01 Citadel ──┐
             ├──> 06 Subscriber P&L ──> 07 Enterprise tier
02 Wasm ─────┤                            ^
03 IronClaw  │ (independent, merges into 06 audit)
04 CEX ──────┘ (independent, merges into 06 exec)
05 Signal ─────────────────────────────────┘
```

**Parallel runs:** 01, 02, 03, 04, 05 = 5 concurrent dev lanes (zero file overlap). 06 waits on 01+02. 07 waits on 05+06.

## Key References

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md`
- Reuse surface: `plans/reports/scout-260416-2312-raas-reuse-surface.md`
- Active non-conflicting plan: `plans/260416-1213-chinh-danh-a16z-dual-layer/plan.md`

## Constraints (enforced)

- TypeScript strict, 0 `any`, 0 `@ts-ignore`
- File size cap 200 LOC (split at 180)
- Bun + Cloudflare Pages deploy (Vercel BANNED)
- No health/wellness/medical wording (Polar compliance — trading OK)
- Reuse existing `better-auth`, `src/gate/raas-gate.ts`, `src/billing/*`, `src/db/schema.sql`
- No .mekong/studio/ edits

## Deferrals (aggregated from phase reports)

**Citadel (01):** SGX/TDX hardware quotes via PCCS → D2; KEK rotation schedule TBD.
**Wasm (02):** Remaining 45 strategies port-on-demand (YAGNI); Wasmtime fuel-metering (wall-clock sufficient MVP).
**IronClaw (03):** Wire `order-executor.ts` + `sentiment-feed.ts` fetch-proxy (outside glob); ML semantic leak detection post-MVP.
**CEX (04):** dYdX perp/leverage order placement (read-only shipped); wire into order-executor routing (Phase 06 scope).
**Signal (05):** Mount routers in `src/api/server.ts`; persistent D1 subscription store (in-memory shipped); Telegram `/subscribe` bot command automation.
**P&L Dashboard (06):** Dashboard vitest runtime (tests type-check but runner not wired); swap in-memory for D1/Postgres persistence where applicable.
**Enterprise (07):** `/api/enterprise/inquiries` route registration in express router; Postgres persistence for inquiry store; CRM sync (HubSpot/Pipedrive); TAM auth middleware; SOC 2 Type II (6+ months operational, post-launch).

## Known Blockers (code-reviewer 2026-04-17, 7.5/10)

Must resolve before production cut-over (follow-up PR):
- **B1** Wire `subscriberPnlRouter` into `src/api/server.ts` — endpoints return 404 until registered
- **B2** Add `/api/enterprise/inquiries` GET/POST/PATCH routes to express router
- **B3** Add `jsdom` dev-dep + wire `dashboard/vitest.config.ts` for UI test runtime
- **B4** TAM dashboard (`enterprise-tam-dashboard-page.tsx`) missing client-side admin-role gate
- **H1** Scrub "BAA" HIPAA term from enterprise pricing FAQ (Polar flag risk per 2026-03-23 incident)
- **H2** Enterprise inquiry store in-memory — persist to Postgres before first prospect
- **H3** `subscriber-executor.getRecentExecutions` bypasses `tenantQuery()` helper — refactor for consistency

Review report: `plans/reports/code-reviewer-260417-0657-raas-solo-phase-06-07.md`
