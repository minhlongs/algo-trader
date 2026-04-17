# Phase 02 — LLM Router Qwen Provider Extension

## Context Links

- File: `/Users/macbookprom1/algo-trader/src/config/llm-config.ts`
- File: `/Users/macbookprom1/algo-trader/src/lib/llm-router.ts`
- File: `/Users/macbookprom1/algo-trader/src/intelligence/signal-consensus-swarm.ts`
- File: `/Users/macbookprom1/algo-trader/src/intelligence/signal-validator.ts`
- Depends: Phase 01 (MLX server @ :11437 running)

## Overview

**Priority:** P1
**Status:** done
**Effort:** 3h
**Description:** Extend `LlmConfig` interface to include optional `qwen: LlmEndpoint`. Add `LlmRouter.qwenChat()` method. Slot Qwen as optional 4th persona (`quantitative-analyst`) in consensus swarm. All changes backward-compatible — unset env = existing behavior.

## Key Insights

- Router already supports multi-endpoint chaining. Adding `qwen` is ~30 LOC config + ~20 LOC method.
- Consensus swarm uses same LLM router; new persona is pure prompt-engineering.
- **DRY:** no new HTTP client. Reuse `callEndpoint()`.
- **KISS:** Qwen NOT in default fallback chain. Opt-in via `LLM_QWEN_ENABLED=true`. Keeps existing signal path zero-risk.

## Requirements

**Functional:**
- `loadLlmConfig()` returns `qwen` endpoint if `LLM_QWEN_URL` env set; else undefined
- `LlmRouter.qwenChat(request)` uses Qwen if available; falls back to `chat()` chain if Qwen unhealthy
- `signal-consensus-swarm.ts` gains optional 4th persona (reads `SWARM_QWEN_ENABLED` env)
- Quorum still 2/N majority; N=3 default, N=4 if Qwen enabled

**Non-functional:**
- Zero breaking changes to existing callers of `chat()` / `fastChat()`
- Feature flag toggleable at runtime (env var, no rebuild)

## Architecture

```
LlmRouter
├─ chat()      [DeepSeek → Ollama → cloud]         (unchanged)
├─ fastChat()  [Nemotron → DeepSeek → ...]         (unchanged)
└─ qwenChat()  [Qwen → DeepSeek → Ollama → cloud]  (NEW)

signal-consensus-swarm.ts (N-persona debate)
├─ risk-analyst      (existing, uses .chat())
├─ momentum-trader   (existing, uses .chat())
├─ contrarian        (existing, uses .chat())
└─ quantitative-analyst (NEW, uses .qwenChat() if enabled)
```

## Related Code Files

**Modify:**
- `src/config/llm-config.ts` — add `qwen` field to `LlmConfig`, env-driven loader (~15 LOC)
- `src/lib/llm-router.ts` — add `qwenChat()` method + Qwen health tracking (~40 LOC)
- `src/intelligence/signal-consensus-swarm.ts` — add 4th persona + quorum math (~30 LOC)

**Create:**
- `src/lib/__tests__/llm-router-qwen.test.ts` — unit tests for qwenChat routing (new file, ~80 LOC)

**Do NOT modify:**
- `src/intelligence/signal-validator.ts` — Phase 03 will wire separately; keep this phase tight
- Any existing callers of `chat()` / `fastChat()`

**File ownership (if parallelized):** backend owns all files above; no overlap with Phase 03's `signal-ingest-route.ts`.

## Implementation Steps

1. **llm-config.ts**: add `qwen?: LlmEndpoint` to `LlmConfig` interface; loader reads `LLM_QWEN_URL`, `LLM_QWEN_MODEL`, defaults `http://127.0.0.1:11437/v1` + `Qwen3-30B-A3B-4bit`, timeout 60000.
2. **llm-router.ts**: add `qwenChat(req)` method. If `config.qwen` set + healthy → `callEndpoint(config.qwen, req, 'mlx')` with tag `provider: 'mlx-qwen'`. On failure → delegate to `this.chat(req)`.
3. **llm-router.ts**: extend `RouterResponse.provider` union type to `'mlx' | 'mlx-qwen' | 'ollama' | 'cloud'`.
4. **signal-consensus-swarm.ts**:
   - Add `QUANTITATIVE_ANALYST_PROMPT` (Qwen's persona: rigorous quant, MoE reasoning for stat arb edge)
   - If `process.env.SWARM_QWEN_ENABLED === 'true'`, append persona; route its call via `router.qwenChat()`
   - Quorum helper: `majorityThreshold(n) = Math.floor(n/2) + 1` (N=3→2, N=4→3)
5. **Tests** (`llm-router-qwen.test.ts`):
   - Qwen enabled + healthy → used
   - Qwen enabled + unhealthy → falls back to DeepSeek
   - Qwen disabled (no env) → qwenChat delegates to chat() immediately
   - Cloud budget honored (Qwen failure does not skip budget check)
6. Run `pnpm run typecheck` — must be 0 errors
7. Run `pnpm test -- llm-router-qwen` — must be 100% pass
8. Commit: `feat(llm): add Qwen provider to router + optional 4th swarm persona`

## Todo List

- [x] `llm-config.ts` extended (backward compat verified)
- [x] `llm-router.ts` `qwenChat()` method added
- [x] `signal-consensus-swarm.ts` 4th persona + quorum math
- [x] `llm-router-qwen.test.ts` written, 9 tests (all pass)
- [x] `pnpm run typecheck` green (0 errors)
- [x] Existing test baseline unchanged (786 pass / 24 pre-existing dashboard fails)
- [x] Commit c26d4b2 on branch `feat/qwen-llm-router-phase02`
- [x] PR #107 opened → main

## Success Criteria

- With `LLM_QWEN_URL=http://127.0.0.1:11437/v1` + `SWARM_QWEN_ENABLED=true`, smoke test swarm call routes to Qwen for 1 of 4 votes
- With `SWARM_QWEN_ENABLED=false` (default), behavior identical to pre-phase
- All 211 existing tests pass + 4 new Qwen tests pass
- `typecheck` exit code 0

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Qwen JSON output malformed | Medium | Reuse existing `parseVoteResponse()` tolerant parser; REJECT on parse failure (fail-closed) |
| Quorum math off-by-one | Low | Unit test majorityThreshold(3)=2, (4)=3, (5)=3 |
| Env var typo | Low | Document in `.env.example` + README section |
| Timeout too aggressive (60s) | Medium | First live run: telemetry p99 latency → tune if >90s |

## Security Considerations

- No secrets added. Qwen is local loopback only.
- Persona prompt injection: Qwen sees same `SignalCandidate` structure as other personas. No elevated data access.
- Router health state is in-memory — no persistence risk.

## Next Steps

- Phase 03 depends on this: signal daemon uses `LLM_QWEN_URL` to reach Qwen.
- Do NOT merge to `main` until Phase 05 complete (single PR covering all phases).
