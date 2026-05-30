# BRIEFING — 2026-05-30T06:53:06Z

## Mission
Orchestrate the performance optimization, database tuning, WebSocket compression, frontend rendering polish, and k6 load/stress testing of the Algo-Trader RaaS system, verifying acceptance criteria (p95 latency < 100ms under 5000 VUs, all tests passing, and no memory leaks).

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/macbook/algo-trader/.agents/orchestrator
- Original parent: main agent
- Original parent conversation ID: 1dd92f6e-b002-4844-bcee-0139cf4e2a00

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /Users/macbook/algo-trader/PROJECT.md
1. **Decompose**: Decompose requirements into milestones (Database optimization, Redis cluster, WebSocket, dashboard rendering, load testing, verification).
2. **Dispatch & Execute**:
   - **Direct (iteration loop)**: Explorer → Worker → Reviewer → test → gate
   - **Delegate (sub-orchestrator)**: When an item is too large, spawn a sub-orchestrator for it
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: At 16 spawns, write handoff.md, spawn successor
- **Work items**:
  1. Initialize scope and decompose [pending]
  2. PostgreSQL Database Query & Index Optimization [pending]
  3. Redis Cluster load balancing [pending]
  4. WebSocket Message Compression (permessage-deflate) [pending]
  5. Bento Grid Dashboard real-time rendering optimization [pending]
  6. k6 Load and Stress Testing (5000+ VUs) [pending]
  7. Verification of all criteria [pending]
- **Current phase**: 1
- **Current focus**: Decompose scope and initialize plans

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- You MAY use file-editing tools ONLY for metadata/state files (.md) in your .agents/ folder.
- Hard veto on forensic audit failure.
- Update progress.md as liveness heartbeat.

## Current Parent
- Conversation ID: 1dd92f6e-b002-4844-bcee-0139cf4e2a00
- Updated: not yet

## Key Decisions Made
- Decompose the project into sequential/parallel milestones mapping to the requirements.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_db_opt | teamwork_preview_explorer | Profile postgres schema and repository | completed | 085d5bf2-3d2a-4687-b40d-3b8232cbbd7f |
| worker_db_opt | teamwork_preview_worker | Implement postgres pool, index, and pagination | completed | 9384007a-f948-48ca-b578-1ac63eefe71f |
| explorer_redis_opt | teamwork_preview_explorer | Profile redis cluster options and load balancing | completed | 6401d95c-6f2d-447b-8d02-56b7d9d49901 |
| worker_redis_opt | teamwork_preview_worker | Implement Redis cluster config and WS broadcast refactoring | completed | 8561ab7b-4f75-40b9-bd9d-62d3bb11cf96 |
| explorer_ws_comp | teamwork_preview_explorer | Profile websocket compression options | completed | 285144df-8d38-47bd-8a22-502fd414bebf |
| worker_ws_comp | teamwork_preview_worker | Implement websocket compression and loop serialization | pending | 699a39d3-5c2f-459b-9c1f-ce2cd280699e |

## Succession Status
- Succession required: no
- Spawn count: 6 / 16
- Pending subagents: 699a39d3-5c2f-459b-9c1f-ce2cd280699e
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-15
- Safety timer: task-230
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /Users/macbook/algo-trader/.agents/orchestrator/plan.md — Project execution plan
- /Users/macbook/algo-trader/.agents/orchestrator/progress.md — Milestones and status tracking
- /Users/macbook/algo-trader/.agents/orchestrator/context.md — Context and environment summary
