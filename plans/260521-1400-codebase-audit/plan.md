# Codebase Audit — Algo-Trader RaaS Platform

> **Goal:** transform repo from tribal knowledge → navigable engineering system.
> **Not** an implementation plan. This is a read-only investigative audit.
> **Approach:** observe → map → verify → explain. No premature refactor.

**Started:** 2026-05-21 14:00 (Vietnam)
**Owner:** session lead (Claude Opus 4.7)
**Repo head at audit:** see `00-snapshot.md`

---

## Status

| # | Phase | Status |
|---|-------|--------|
| 00 | Snapshot (head SHA, branch, dirty state) | ✅ done — `00-snapshot.md` |
| 01 | Repo map (top-level + src/) | ✅ done — `01-repo-map.md` |
| 02 | Architecture & flows | ✅ done — `02-architecture.md` |
| 03 | Intelligence + signal + ML | ✅ done — `03-subsystems/intelligence.md` |
| 04 | RaaS / billing / auth | ✅ done — `03-subsystems/raas-billing-auth.md` |
| 05 | Infra & deployment topology | ✅ done — `04-deployment-topology.md` + `03-subsystems/infrastructure.md` |
| 06 | Data feeds & integrations | ✅ done — `03-subsystems/feeds-and-venues.md` |
| 07 | Frontend (dashboard + landing) | ✅ done — `03-subsystems/frontend.md` |
| 08 | Synthesis (00-exec-summary, 01-repo-map, etc.) | ✅ done — `00-executive-summary.md` |
| 09 | Risk & gap report | ✅ done — `05-risks-and-gaps.md` (28 findings) |
| 10 | Glossary + onboarding note | ✅ done — `06-glossary.md`, `07-onboarding.md` |

## Deliverables (final)

Saved under this plan directory:

- `00-executive-summary.md` — what this repo is, in 1 page
- `01-repo-map.md` — every dir, purpose, runtime role
- `02-architecture.md` — entrypoints + request/data flows + dependency graph
- `03-subsystems/` — one file per major subsystem (trading-pipeline, intelligence, raas, feeds, infra, frontend)
- `04-deployment-topology.md` — actual deploy targets verified from configs
- `05-risks-and-gaps.md` — operational risks + confidence-marked unknowns
- `06-glossary.md` — internal terms (CashClaw, AlphaEar, Kronos, AgentDispatcher, RaaS tier names…)
- `07-onboarding.md` — what a new engineer reads first, in order

## Working principles

- Existing `docs/` (75+ files) is treated as **input hypothesis**, not ground truth. Verify against code.
- Every claim cites `file:line` or is marked `Confidence: Low / Needs-verification`.
- No code changes. No doc rewrites under `docs/`. All output stays in this plan dir.
- Sacrifice grammar for concision.

## Raw exploration reports

Each subagent saves to `reports/explore-NN-*.md`. These feed the synthesis files above. Reports are kept for traceability.

## Open questions

(populated during synthesis)
