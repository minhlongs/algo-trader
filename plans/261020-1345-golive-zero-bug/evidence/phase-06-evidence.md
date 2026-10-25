# Phase 06 — Rollout Doc Truth Reconciliation (evidence)

**Completed:** 2026-10-20T11:23:25Z

## Highest-value fix: CLAUDE.md rollback section was dangerous

The documented kill switch called `POST https://algo-trader.workers.dev/api/admin/rollback/kill/*`.
Two independent defects:

1. The host does not resolve (curl exit 6).
2. **The route does not exist on the Worker at all.** The real L1 kill switch is an env/KV
   flag read by `isKillSwitchActive()` (`src/desk/wiring/qwen-drawdown-monitor.ts:37`), not HTTP.

During an incident, an operator following that command would have lost time debugging a
non-existent endpoint. Replaced with `wrangler rollback` + the real `QWEN_KILL` /
`SWARM_QWEN_ENABLED` flag paths, and pointed at `docs/ai-first-enforcement-gates.md` for L0–L4.

## docs/production-rollout-plan.md

Replaced the blanket "Technical Readiness: complete" block with a verified table. Each checked
box names the command that proves it; each unchecked box states what is missing and why.
Added a single explicit topology statement (one Worker on `api.cashclaw.cc`).

## Also corrected

- The 3-region tooling that pointed at the dead host (Phase 03).
- Gate 5 (`ci-gate-deploy-smoke.mjs`) is healthy and was deliberately left alone — the earlier
  draft wrongly listed it as broken.
