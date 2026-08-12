# Plan — Migrate 9 Intelligence Modules to LlmRouter

## Reframed Problem
9 intelligence modules bypass the central `LlmRouter` and call LLM APIs via raw `fetch()`. All must route through `LlmRouter.chat()` to enforce the OmniRoute gateway at `http://omnimbp.local:20128/v1`.

## Work Checklist

### Step 1: Enumerate remaining raw fetch() call sites
Run `grep -rn 'fetch(' src/desk/intelligence src/desk/feeds src/intelligence` to list all raw fetch calls targeting `/chat/completions`. Expected: ~7 modules.

### Step 2: Migrate each module (7 modules)
For each file:
- Remove `loadLlmConfig` import (if present) and any endpoint URL construction
- Import `LlmRouter` and `ChatMessage` from `src/lib/llm-router`
- Replace raw `fetch()` body + call with `router.chat({ model, messages, temperature?, maxTokens? })`
- Validate response via `response.content` (no `resp.json()` parsing)
- Ensure module compiles: `npx tsc --noEmit`

**Files to migrate:**
1. `src/desk/feeds/news-impact-analyzer.ts`
2. `src/desk/intelligence/logical-hedge-discovery.ts`
3. `src/desk/intelligence/resolution-criteria-analyzer.ts`
4. `src/desk/intelligence/semantic-dependency-discovery.ts`
5. `src/desk/arbitrage/self-evolving-ilp-constraints.ts`
6. `src/intelligence/signal-consensus-swarm.ts`

### Step 3: Final verification
- `grep -rn 'fetch(' src/desk/intelligence src/desk/feeds src/intelligence` — zero `/chat/completions` fetches
- `npx tsc --noEmit` — 0 errors

## Risks & Gates
- Risk: Module uses `fetch()` for non-LLM purposes (RSS, REST APIs) → gate: grep confirms only `/chat/completions` paths removed
- Risk: `LlmRouter` constructor throws on non-OmniRoute URLs → mitigated: all endpoints already route through OmniRoute gateway

## Agents
- Implementation: `fullstack-developer` (per module)
- Review: `code-reviewer` (after all modules)
- Serve as fallback if node routes fail.

## Ship Plan
1. Commit + push branch
2. PR → CI verify
3. Merge → deploy via CF `wrangler deploy`
4. Smoke test: `curl https://omnimbp.local:20128/v1/health`