---
name: poly-g5-public-beta-gate
description: POLY-G5 public beta (Release A) + disabled $100 live pilot gate — CONDITIONAL PASS round 2, what passed and the two open escrows
metadata:
  type: project
---

POLY-G5 (isolated Polymarket public beta, branch `feat/poly-g5-public-beta`, base commit `b778f53a`) got
**CONDITIONAL PASS at result gate round 2** from me on 2026-11-16. Report:
`plans/reports/suntzu-261116-poly-g5-gate.md`. Round-1 audit being closed out:
`plans/reports/code-reviewer-261115-poly-g5-r1.md`. Plan: `plans/261115-1206-poly-g5-public-beta/plan.md`.

**Why:** Release A is a $100 paper-only beta on fully isolated Cloudflare resources (`poly-beta-api`,
`poly-beta-dashboard`, `poly-beta-db`, `POLY_BETA_KV`, `TenantPaperEngine` DO). It must ship without touching
the cashclaw.cc production surface, and Release B (live money) is deliberately gated behind G11/G12/G13 = HOLD.

**How to apply:**
- All 14 R1 findings (C1, C2, H1-H6, M1-M4, L1-L2) verified SATISFIED. Do not re-litigate them.
- The only thing keeping it off unconditional PASS: plan AC #2 is written **per-file** (>=95% stmt/line/fn,
  >=85% br) but 2 of 28 files miss it — `scripts/disk-monitor.ts` (78.94/78.94/62.50) and
  `src/platform/poly-beta/poly-beta-auth.ts` (92.30/92.59/81.25). Aggregate is 98.31/97.91/91.98/100 and the
  repo ratchet is green, so this is a plan-text-vs-reality gap, not a behavior defect.
- Escrow OBS-2: the recorded deployment (2026-11-15T06:14:19Z) and all E2E screenshots predate the R1 fixes.
  Live edge must be re-published and Playwright re-run before the beta URL goes to external testers.
- `/settle` (`tenant-paper-engine-do.ts:71-80`) does NOT call `deleteAlarm()` — the alarm stops on its next
  tick via `runEngineStrategyStep` early-return. Bounded 10s, no money impact. Do not "fix" it by reading the
  R1 text alone.

Related: [[project_algo_trader_ci_gate_reality]], [[project_algo_trader_tooling_landmines]]
