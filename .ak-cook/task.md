# Task: Wire OmniRoute into algo-trader trading flow

## Description
Wire the OmniRoute gateway (`http://omnimbp.local:20128/v1`) into the algo-trader trading execution flow for own-account execution. The trading flow currently calls LLM endpoints directly; it must route through the OmniRoute gateway instead.

## Outcome
All trading-own-account LLM calls route through the mandatory OmniRoute gateway. No direct endpoint calls bypass the gateway.

## Constraints
- Do not break existing LLM routing chain (DeepSeek R1 → Ollama → Claude cloud)
- Keep all existing Retry/health/fallback logic intact
- OmniRoute gateway is mandatory — same as llm-router.ts enforcement
- Must pass typecheck (`0 errors`) and tests (`% pass`)

## Non-goals
- Do not add new LLM models or endpoints
- Do not change the existing routing priority order
- Do not modify `src/deck/shared/config/llm-config.ts`

## Acceptance Criteria
1. Trading service reads OMNIROUTE_URL from config (same source as llm-router)
2. `/api/v1/llm/health` endpoint returns per-route gateway status
3. `pnpm vitest run` passes all tests
4. `pnpm tsc --noEmit` returns 0 errors
5. Ship report: GREEN (HTTP 200 on prod URL)
