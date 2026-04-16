---
title: "Solo-Platform B2B RaaS Upgrade (algo-trader)"
description: "Layer Citadel+Wasm+IronClaw+BYOK+CEX+Signal API+Subscriber P&L+Enterprise tier on top of existing algo-trade RaaS"
status: pending
priority: P1
effort: 7 phases / ~10-14d
branch: master
tags: [raas, solo-platform, enterprise, byok, multi-tenant, citadel, wasm]
created: 2026-04-16
---

# Solo-Platform RaaS Upgrade — Overview

**Goal:** Upgrade algo-trader into enterprise-grade B2B RaaS per Solo-Platform doctrine (PDF Giai Doan 1-3 core, 4 deferred). Tier $49k-$499k. BYOK + zero data egress + per-subscriber sandbox.

**Thesis:** Reuse 46 Polymarket strategies + Better Auth + license gating + billing + D1 sync + React dashboard. Build-new: security perimeter (Citadel/Wasm/IronClaw), CEX adapter, signal feed API, multi-tenant analytics, enterprise onboarding. K8s = OUT-OF-SCOPE (prototype only, deferred).

**Non-conflict:** Active plan `260416-1213-chinh-danh-a16z-dual-layer` is 3/4 shipped (manifesto/dashboard/D1/polymarket). This plan layers orthogonally — no file overlap.

## Phases

| # | Phase | Owner glob | Deps | Status |
|---|---|---|---|---|
| 01 | Citadel Protocol MVP (attestation stub + BYOK KMS wrap) | `src/citadel/**`, `src/lib/byok-*.ts` | — | pending |
| 02 | Wasm Sandbox (per-subscriber exec isolation) | `src/sandbox/**` | — | pending |
| 03 | IronClaw DLP (outbound filter + audit log) | `src/ironclaw/**`, `src/audit/dlp-*.ts` | — | pending |
| 04 | CEX adapter (Binance + dYdX) | `src/markets/cex/**`, `src/execution/cex-*.ts` | — | pending |
| 05 | Signal feed API (REST + Telegram) | `src/signal/**`, `src/api/routes/signal-*.ts` | — | pending |
| 06 | Subscriber P&L dashboard (multi-tenant lens) | `src/raas/subscriber-*.ts`, `dashboard/src/pages/subscriber-*.tsx` | 01, 02 | pending |
| 07 | Enterprise tier + onboarding UX ($49k-$499k) | `src/billing/enterprise-*.ts`, `dashboard/src/pages/enterprise-*.tsx` | 05, 06 | pending |

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

## Design Gate

See 5 decisions at bottom of spawn-message; plan cook halted until user approves.
