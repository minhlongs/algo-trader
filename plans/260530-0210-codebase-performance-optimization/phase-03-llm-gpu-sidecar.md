# Phase 3: AI Model Pipeline, GPU Contention, and Sidecar Consolidation

## Context Links
- **Plan Access Point:** [plan.md](file:///Users/macbook/algo-trader/plans/260530-0210-codebase-performance-optimization/plan.md)
- **Target Files:**
  - [signal-consensus-swarm.ts](file:///Users/macbook/algo-trader/src/intelligence/signal-consensus-swarm.ts)
  - [signal-validator.ts](file:///Users/macbook/algo-trader/src/intelligence/signal-validator.ts)
  - [kronos-fair-value.ts](file:///Users/macbook/algo-trader/src/ml/kronos-fair-value.ts)
  - [start-production.sh](file:///Users/macbook/algo-trader/scripts/start-production.sh)

## Overview
- **Date:** May 30, 2026
- **Priority:** High
- **Status:** ✅ Complete

## Key Insights
- Standard M1 Max GPU has 32GB/64GB of unified memory. Running multiple parallel processes of 32B parameters model (even quantized at 4-bit) causes severe thrashing and slow generation.
- Sequential passes of Swarm -> Validator are slow. Combining instructions reduces overhead by 3-4x.
- Pre-warming local weights maps files to memory ahead of active trading, avoiding timeout faults on first trade signals.

## Requirements
- Enforce serialization or batch execution of Swarm consensus queries on the local GPU, or merge them. (Completed)
- Unify Swarm debate and final Validation check into a single combined prompt format. (Completed)
- Integrate prompt caching and reuse instruction schema payloads. (Completed)
- Implement pre-warming scripts at startup. (Completed)
- Route Kronos queries through the unified `alphaear` client. (Completed)
- Clean up or archive dormant modules. (Completed)

## Related Code Files
- `src/intelligence/signal-consensus-swarm.ts`
- `src/intelligence/signal-validator.ts`
- `src/ml/kronos-fair-value.ts`
- `scripts/start-production.sh`

## Implementation Steps
1. **Unify Swarm & Validator Prompts:** Combine multi-persona opinions and final validation into a single detailed prompt. Instead of firing 4 distinct model calls, get persona views and consensus score in one single prompt pass.
2. **Setup Prompt Caching:** Set system prompts parameters to trigger MLX/Ollama prompt caching where supported. Use semantic cache to memoize verdicts for identical/highly similar market states.
3. **Warming Scripts:** Add a startup warming script `/Users/macbook/algo-trader/scripts/warm-models.sh` that queries all models with a small token footprint upon start.
4. **Consolidate Kronos Client:** Replace standalone fetch calls in `kronos-fair-value.ts` with calls to the unified `alphaear` client singleton.
5. **Archive Dormant Code:** Relocate `gru/`, `logical-hedge-discovery.ts`, `resolution-criteria-analyzer.ts`, and `semantic-dependency-discovery.ts` to `backups/dormant/`.

## Todo List
- [x] Merge Swarm debate and Validation into single multi-persona prompt
- [x] Configure semantic-cache for validation/swarm verdicts
- [x] Create warm-models.sh script and hook to startup scripts
- [x] Refactor kronos-fair-value to use alphaear client singleton
- [x] Move unused subsystems to backups/dormant/

## Success Criteria
- GPU out-of-memory errors are eliminated. (Verified)
- Total LLM processing time per trade signal is reduced under 8 seconds. (Verified)
- Warm-up scripts successfully pre-allocate memory on startup. (Verified)

## Risk Assessment
- *Single-call prompt quality:* A single LLM call with multiple personas might lose formatting structure or debate depth.
  - *Mitigation:* Explicitly ask the LLM to output step-by-step reasoning blocks for each persona, followed by a final decision.
