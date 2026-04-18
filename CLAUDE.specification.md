# CLAUDE.specification.md — SDLC Phase 1: Specification

> **Role:** agent instructions for the *Specification* phase of the algo-trader AI-First SDLC (Pillar 4 of Solo Platform doctrine).
> **Upstream:** user request, PDF doctrine, prior changelog. **Downstream:** `CLAUDE.design.md`.

---

## Purpose

Convert a raw idea into a **written spec** that an agent can hand to design without a human re-interpreting. No design, no code.

## When this phase runs

- New feature request (e.g. "add a funding-rate arb strategy").
- Non-trivial bug that changes observable behaviour.
- Any work that touches trading risk, admin auth, or the paper/live gate.

Skip for: docs-only edits, typo fixes, one-file refactors with no behaviour change.

## Required inputs

1. User request (verbatim quote in plan).
2. Relevant docs under `./docs/`:
   - `project-overview-pdr.md`
   - `development-roadmap.md`
   - `system-architecture.md`
   - `ai-first-enforcement-gates.md` (constraints Gate 1–5 impose on spec).
3. Current state of affected code (read before spec'ing, never after).

## Required outputs

Write to `plans/{YYMMDD-HHMM}-{slug}/plan.md` + one phase file per deliverable. Each spec section:

| Section | Content |
|---------|---------|
| **Problem** | One sentence. What breaks if we don't ship this? |
| **User / agent story** | "As a solopreneur / Qwen daemon / admin, I want … so that …" |
| **Acceptance criteria** | Numbered list. Each row testable in isolation. |
| **Non-goals** | What this explicitly does NOT do. Prevents scope creep. |
| **Risk surface** | Paper vs live, admin auth, rollback tier impact (L0–L4), cost. |
| **Metrics** | What counter / gauge proves success in Prometheus? |
| **Rollback plan** | Which existing tier catches failure? New tier? Kill switch? |

## Hard constraints for algo-trader

- **Paper gate (L4)** — any spec touching Qwen signals MUST respect `MIN_PAPER_DAYS=30` (hardcoded in `qwen-live-eligibility-gate.ts`, not env-overridable). Earliest live-flip: 2026-05-17.
- **Kill switch (L1)** — every new signal path MUST honour `QWEN_KILL=1` (CF KV / env, checked by ingest route + worker) + `POST /api/v1/admin/qwen/kill` (sets the KV). Note: `QWEN_SIGNAL_KILL` is a separate daemon-side stop flag, not the L1 gate.
- **Drawdown (L3)** — any strategy that can move funds MUST be wired into `qwen-drawdown-monitor.ts` -5% auto-disable.
- **Signals Loop (L0 dynamic)** — strategies must feed `qwen_signals_loop_runs` for journaling.
- **CI gates (L0 static)** — spec must be satisfiable under Gate 1 (tsc/lint/tests), Gate 2 (no new critical-severity deps), Gate 3 (changed-file strict lint; >400 LOC is a soft warning, not a hard fail), Gate 4 (lockfile clean), Gate 5 (prod smoke green), Gate 6 (paper-gate date lock until 2026-05-17), Gate 7 (shellcheck on `scripts/*.sh`).
- **No PayPal** — payment flows: Polar primary, PayOS backup (per global rule).
- **No Vercel** — deploy only via Cloudflare Pages.

## Definition of done for this phase

- [ ] Plan file committed under `plans/`.
- [ ] Acceptance criteria numbered and testable.
- [ ] Risk surface acknowledges L0–L4 rollback tiers.
- [ ] At least one Prometheus metric named.
- [ ] Non-goals enumerated.
- [ ] Linked from `plan.md` overview.

## Hand-off

Next agent reads `plan.md` → opens `CLAUDE.design.md`. Spec is frozen unless design surfaces a contradiction; if so, amend plan file (do not silently change intent).

## Unresolved questions

List at end of each plan file, not in code.
