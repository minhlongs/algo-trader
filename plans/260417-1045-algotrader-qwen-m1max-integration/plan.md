---
title: "Algo-Trader Qwen M1 Max Integration (Option B: daemon-pushes-signals)"
description: "Swap DeepSeek-only pipeline to Qwen3-30B-A3B + DeepSeek R1 hybrid via M1 Max daemon pushing to existing signal REST API. Paper-gate enforced."
status: complete
priority: P1
effort: 16h
branch: feat/qwen-m1max-signal-daemon-260417
tags: [llm, qwen, mlx, m1max, signal-pipeline, paper-trading]
created: 2026-04-17
---

# Algo-Trader Qwen M1 Max Integration

## Overview

Swap bootstrap Option B (Qwen provider) into algo-trader. Reuse existing:
- `src/config/llm-config.ts` — add Qwen endpoint slot (no new framework)
- `src/lib/llm-router.ts` — extend routing (Qwen → DeepSeek fallback)
- `src/signal/signal-publisher.ts` — daemon posts via existing REST
- `src/wiring/paper-trading-orchestrator.ts` — paper-gate enforcement
- `src/intelligence/signal-consensus-swarm.ts` — Qwen slots as 4th persona

**Delivery pattern:** Option (B) — daemon on M1 Max generates signals using local Qwen3-30B-A3B, HTTP POSTs to algo-trader CF Worker `/api/v1/signals/ingest` (new, authenticated endpoint). Zero new vendor, zero WebSocket rewrite.

**Why NOT (A) CF-calls-back-home:** Worker→M1Max callbacks add latency, CF Tunnel dependency on hot path. Daemon pushes = fire-and-forget, battle-tested.

**Why NOT (C) hybrid:** premature. Start with (B); (C) is an optimization we may never need (YAGNI).

**Model:** Qwen3-30B-A3B MLX 4-bit (~18GB RAM, MLX-confirmed). NOT 3.6-35B (weights don't fit + no MLX yet).

## Phases

| # | Name | Effort | Status | Owner | Commit |
|---|------|--------|--------|-------|--------|
| 01 | [M1 Max Qwen MLX server provisioning](phase-01-m1max-qwen-mlx-provisioning.md) | 3h | ✅ DONE | ops | `95b3b08` PR #108 |
| 02 | [LLM router Qwen provider extension](phase-02-llm-router-qwen-provider.md) | 3h | ✅ DONE | backend | `c26d4b2` PR #107 |
| 03 | [Signal ingest HMAC endpoint + daemon](phase-03-signal-ingest-endpoint-and-daemon.md) | 4h | ✅ DONE | backend | `f79d2b8` PR #109 |
| 04 | [Paper-gate integration + rollback harness](phase-04-paper-gate-rollback-harness.md) | 3h | ✅ DONE | backend | `ff3332c` PR #110 |
| 05 | [Tests + CI green + docs sync](phase-05-tests-ci-docs-sync.md) | 3h | ✅ DONE | tester | PR #111 |

Total: 16h. Each ≤4h. KISS.

## Dependencies

- **Upstream:** PR #106 (RaaS Solo-Platform) MERGED. Signal feed API live. LLM router live.
- **Blocker:** none. All code paths exist.
- **External:** `ssh m1max-cf` reachable. MLX Python env on M1 Max.
- **Prerequisite:** Qwen3-30B-A3B MLX weights pulled on M1 Max (~18GB disk).

## Architecture (Option B)

```
[M1 Max Daemon (Python)]
  ├─ Qwen3-30B-A3B MLX (port 11437)
  ├─ DeepSeek R1 MLX (port 11435, existing)
  └─ signal-generator-daemon.py
       └─ HTTP POST → https://algo-trader.pages.dev/api/v1/signals/ingest
           (HMAC-signed, tier=ENTERPRISE, source=qwen-m1max)
             ↓
[CF Worker: signal-ingest-route.ts (new)]
  └─ signalPublisher.publish() (existing)
       ↓
[Existing fan-out]
  ├─ D1 persist
  ├─ SSE broadcast (existing)
  ├─ Telegram push (existing)
  └─ paper-trading-orchestrator guard (existing)
```

## Rollback Plan

- **Qwen hallucinates bad signal:** `KILL_SWITCH_QWEN=1` env → daemon exits; DeepSeek-only path resumes.
- **Paper P&L drops >5% in 24h:** auto-disable Qwen persona in swarm (feature flag `SWARM_QWEN_ENABLED=0`).
- **Bad deploy:** revert signal-ingest-route.ts; daemon keeps firing to 401, logs drain; no corruption.
- **Live-money guard:** `MIN_PAPER_DAYS=30` — NO live execution until Qwen has 30d paper history. Hard-coded in `wiring/paper-trading-orchestrator.ts`.

## Success Criteria (whole plan)

- Qwen MLX server running on M1 Max, `curl :11437/v1/models` returns 200
- LLM router routes `routeQwen=true` requests to port 11437
- Daemon posts ≥1 signal/hour during US market hours for 7 consecutive days
- Signal appears in D1 `signals` table with `strategy='qwen-m1max-v1'`
- Paper P&L tracked separately (`paper_trades_v3.source='qwen'`)
- All 211+ existing tests pass; new Qwen tests ≥15 added
- CI green on PR merge (GitHub Actions + CF Pages deploy)
- Docs updated: `docs/system-architecture.md`, `docs/development-roadmap.md`, `docs/project-changelog.md`

## Constraints Respected

- YAGNI: no new vendor, no WebSocket rewrite, no vector DB
- KISS: daemon is Python+httpx+mlx-lm; ≤200 LOC
- DRY: reuse `signal-publisher.ts`, `llm-router.ts`, paper-trading-orchestrator
- Polymarket HMAC stub NOT touched (separate tech debt)
- Mekong CLI Tier A/B/C patterns reused (CI gates, OTel signals, SDLC docs)

## Unresolved Questions

1. SSE broadcaster reuse vs new WebSocket channel for Qwen stream? → **ANSWER IN PHASE 03:** reuse SSE; no new channel.
2. Qwen3-30B-A3B + DeepSeek R1 concurrent (30GB RAM) or LRU swap? → **PHASE 01 decision:** concurrent; M1 Max has ~40GB free w/ macOS baseline. LRU only if >50GB pressure.
3. $500 auto-approve threshold from a16z Phase 03 — keep as hard gate for Qwen-generated trades? → **PHASE 04 decision:** YES, enforce $500 as `QWEN_AUTO_APPROVE_MAX_USD` env. Larger trades require human sign-off.

## Next Steps

1. Execute Phase 01 via `ssh m1max-cf` (pull MLX weights, start server)
2. Branch off `main`: `git checkout -b feat/qwen-m1max-signal-daemon-260417`
3. Phases 02→05 sequential; Phase 05 can parallelize tests + docs
4. PR after Phase 05; require CI green before merge
5. Post-merge: 30-day paper observation window BEFORE any live flag flip
