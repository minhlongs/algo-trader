# Next Wave II — Parallel Execution Plan

> Execute the pending Next Wave II plan (7 phases) as 3 parallel tracks using agent swarms.
> Generated: 2026-07-03 04:26 | Mode: brainstorm | Base plan: `plans/260703-0204-next-wave-II/`

---

## 1. Problem

Next Wave II plan is fully detailed but `status: pending`. The plan has 7 phases covering strategy implementation (12 strategies), onboarding API, risk gate wiring, dashboard pages, testing, and verification. It was created with sequential dependencies but can be **parallelized into 3 tracks** for significantly faster wall-clock execution.

## 2. Skills Utilized

- `/stitch` — Generate UI mockups for Phase 5 dashboard pages using the gold design system
- `/frontend-design` / `/ui-styling` — Build React pages from Stitch designs with gold/purple tokens
- `/ui-ux-pro-max` — Validate design direction for dashboard UI
- `/cook song song` — Multi-agent parallel execution

## 3. Execution Structure — 3 Parallel Tracks

```
                     ┌─────────────────────────────────────┐
                     │  ┌──────────────────────────────┐   │
                     │  │  TRACK 1: STRATEGIES          │   │
                     │  │  Phase 1 → Phase 3 → Phase 4 │   │
                     │  │  (4+4+1 = 9 agents)          │   │
                     │  └──────────┬───────────────────┘   │
                     │             │                       │
                     │  ┌──────────▼───────────────────┐   │
                     │  │  TRACK 2: ONBOARDING + UI    │   │
                     │  │  Phase 2 → Phase 5           │   │
                     │  │  (1 Agent + Stitch + React)  │   │
                     │  └──────────┬───────────────────┘   │
                     │             │                       │
                     │  ┌──────────▼───────────────────┐   │
                     │  │  TRACK 3: TESTING + VERIFY    │   │
                     │  │  Phase 6 → Phase 7            │   │
                     │  │  (1 agent + manual)           │   │
                     │  └──────────────────────────────┘   │
                     └─────────────────────────────────────┘
```

### Track 1: Strategy Agents (9 agents, sequential barriers)

**Phase 1** — 4 simple strategies in parallel (one agent per strategy):

| Agent | Strategy | File |
|-------|----------|------|
| A1 | Momentum Exhaustion | `momentum-exhaustion.ts` |
| A2 | Session Vol Sniper | `session-vol-sniper.ts` |
| A3 | Sentiment Momentum | `sentiment-momentum.ts` |
| A4 | Book Imbalance Reversal | `book-imbalance-reversal.ts` |

**Phase 3** — 8 medium strategies in parallel (2 per agent or 4 agents with 2 each):
- Microstructure Alpha, Gamma Neutral, Split-Merge Execution, Event-Driven Momentum
- Cross-Market Momentum, Vega Skew Decay, Gamma Rebalancing, Liquidity Taking

**Phase 4** — RiskGateManager wrapper + error boundaries (1 agent)

### Track 2: Onboarding API + Dashboard UI (2 agents, sequential)

**Phase 2** — API endpoints (1 backend agent):
- `POST /api/v1/nowpayments/invoice` endpoint
- Better Auth signup hook → trial-drip trigger
- Dunning persistence (Map → DB)
- Migration rollback script

**Phase 5** — Dashboard pages (1 frontend agent):
- Use `/stitch` to generate mockups for 3 pages (API keys, trial status, badges)
- Build React pages with gold design system tokens
- `/frontend-design` + `/ui-styling` for polished implementation

### Track 3: Testing + Verification (1 agent + manual)

**Phase 6** — Risk gate threshold tests, migration rollback tests, regression suite
**Phase 7** — 24h paper trading verification, runbook update

## 4. Dependency Barriers

```
Start: Phase 1 (4 agents) + Phase 2 (1 agent)                    ← PARALLEL
       │
Barrier 1: Wait for Phase 1 complete
       │
       ├──→ Phase 3 (8 strategies, 4+ agents)                     ← PARALLEL with each other
       └──→ Phase 4 (risk gates, 1 agent)
       │
Barrier 2: Wait for Phase 2 complete
       │
       └──→ Phase 5 (dashboard, Stitch + React, 1 agent)
       │
Barrier 3: Wait for Phases 3, 4, 5 all complete
       │
       └──→ Phase 6 (testing, 1 agent)
       │
Barrier 4: Wait for Phase 6 complete
       │
       └──→ Phase 7 (manual verification)
```

## 5. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Strategy agents write conflicting code | Broken build | Git worktree isolation per agent |
| Strategy logic bugs on live market | No real money — PAPER_MODE default | Paper verification period |
| Stitch MCP auth blocks mockups | No visual reference | Design spec is complete without mockups |
| Phase 3 Phase 4 file conflicts | Merge issues | Phase 4 creates new files (RiskGateManager), Phase 3 modifies strategy files — no overlap |
| Multiple strategy agents editing same wiring file | Git conflict | Wire strategies after all agents complete (single agent merges wiring) |

## 6. Next Steps

The existing Next Wave II plan at `plans/260703-0204-next-wave-II/` already has detailed phase files. Recommend proceeding with `/ck:cook --parallel` using that plan.
