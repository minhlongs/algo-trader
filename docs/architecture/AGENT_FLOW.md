# AGENT_FLOW — control flow around the research pipeline

> Increment S11 · audited 2026-08-26 · all paths verified on disk.
> This repo runs deterministic TypeScript pipelines. There is NO LLM ReAct loop in the research
> path (upstream's `agent/src/agent/loop.py` was deliberately not ported — see `MODULE_MAPPING.md` row 5).

## The three loops

### 1. Signal loop (wiring)

`src/wiring/qwen-signals-loop.ts` — wires signal candidates into the consensus pipeline. Feeds the intelligence layer.

### 2. Consensus swarm (intelligence)

`src/intelligence/signal-consensus-swarm.ts` — `runSwarmConsensus(signal)` (:180) aggregates persona votes (`SwarmVote` :14) into a `SwarmConsensus` (:21) under a `PersonaConfig` (:28). Desk-side mirror lives in `src/desk/intelligence/`. This is the repo's answer to upstream's generic worker-pool swarm (`agent/src/swarm/`) — scoped to signal aggregation, verdict ADAPT.

### 3. Strategy execution (engine)

```
src/engine/strategy-runner.ts   (class StrategyRunner :11)
  └─ src/engine/trade-executor.ts  (class TradeExecutor :13, TradeExecutorConfig :9)
       └─ src/engine/core/  (logger.ts, types.ts)
```

The engine executes strategies against the execution-mode gate (`SECURITY_MODEL.md`). In READ_ONLY (default) no order leaves the system.

## Domain agents (agentic layer)

`src/agentic/` holds product-domain agents, each a focused module:

| Agent | Path | Role |
|---|---|---|
| Billing | `src/agentic/billing-agent.ts` | billing operations |
| Content | `src/agentic/content-agent.ts` | content generation |
| Customer success | `src/agentic/customer-success.ts` | support flows |
| Lead hunter | `src/agentic/lead-hunter.ts` | lead qualification |
| Signal provider onboarding | `src/agentic/signal-provider-onboarding.ts` | provider intake |
| Strategy lab | `src/agentic/strategy-lab.ts` | strategy experimentation glue |

Shared contracts in `src/agentic/types/`. These are deterministic service agents, not an autonomous LLM loop.

## Research control flow (alpha-lab)

The research pipeline is driven by CLI + config, not by an agent:

```
cashclaw-cli.ts (src/desk/cli/cashclaw-cli.ts)
  ├─ alpha-commands.ts        (candidates / walkforward / robustness)
  ├─ alpha-report-handler.ts  (report rendering)
  └─ system-doctor.ts         (doctor — environment health, S11)
        │
        ▼
run-experiment.ts (src/alpha-lab/run-experiment.ts)
  └─ experiment-engine.ts → validation → gates → provenance (see DATA_FLOW.md)
```

Promotion decisions flow through `src/alpha-lab/attribution/promotion-state-machine.ts` (DRAFT → PAPER_APPROVED → LIVE_APPROVED). The state machine is exercised in tests; live promotion is separately blocked by the execution gate.

## Health check (system doctor, S11)

`src/desk/cli/system-doctor.ts` + `system-doctor-defaults.ts`, registered as `cashclaw doctor` in `cashclaw-cli.ts` (:274). Runs 5 labelled checks (execution mode, Postgres, provenance ledger, gate summary, quality-baseline) with PASS/FAIL/UNREACHABLE; exit 0 only if no FAIL. This is the repo analog of upstream `agent/src/preflight.py`.

## See also

- `DATA_FLOW.md` — the data the loops consume
- `SECURITY_MODEL.md` — where execution is gated
- `MODULE_MAPPING.md` rows 5, 6, 27, 33
