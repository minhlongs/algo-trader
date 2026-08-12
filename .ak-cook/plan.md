# Plan — Wire OmniRoute into Trading Intelligence Flow

## Reframed Problem
`LlmRouter` already enforces OmniRoute gateway for its class, but 9 intelligence/strategy modules bypass it with raw `fetch(\`\${url}/chat/completions\`)` to `loadLlmConfig().primary.url`. They read the same config but don't honor the gateway. **Fix: inject `LlmRouter` into each caller.**

## Work Checklist

### Phase 1 — Identify & Document Callers
- [x] Scout: enumerate all `chat/completions` raw callers (9 found)
- [x] Confirm `LlmTradingStrategy` already uses `LlmRouter` (pattern proven)

### Phase 2 — Refactor Each Caller
For each file, replace:
```ts
const resp = await fetch(`${llmUrl}/chat/completions`, { ... })
```
with:
```ts
const router = new LlmRouter()
const { content } = await router.chat({ messages, maxTokens, temperature })
```
(No retries/fallbacks changed — LlmRouter handles it.)

Files to touch (identical pattern in each):
1. `src/deck/intelligence/signal-validator.ts` (also `src/desk/intelligence/signal-validator.ts` — check if both exist)
2. `src/deck/intelligence/dual-level-reflection-engine.ts`
3. `src/deck/intelligence/resolution-criteria-analyzer.ts`
4. `src/deck/intelligence/logical-hedge-discovery.ts`
5. `src/deck/intelligence/semantic-dependency-discovery.ts`
6. `src/intelligence/signal-consensus-swarm.ts`
7. `src/desk/strategies/probability-calibrator.ts`
8. `src/desk/feeds/news-impact-analyzer.ts`
9. `src/desk/arbitrage/self-evolving-ilp-constraints.ts`

### Phase 3 — Tests & Typecheck
- [ ] Run `pnpm vitest run` — expect 100% pass
- [ ] Run `pnpm tsc --noEmit` — expect 0 errors

### Phase 4 — Review & Ship
- [ ] code-reviewer subagent
- [ ] Ship report: GREEN

## Risks & Gates
- **Risk:** Some modules may not sync-import `LlmRouter` (will need to add import + instantiate)
- **Risk:** Tests that mock `loadLlmConfig().primary.url` may need update
- **Gate:** No behavior change from caller perspective (same responses, just routed through gateway)
- **Gate:** No new env vars, no config key changes

## Agent Assignments
- Implementation: `fullstack-developer` (parallel groups by module)
- Testing: `tester`
- Review: `code-reviewer`
- Finalize: project-management skill + git-manager

## Ship Plan
1. Pre-deploy: typecheck + test pass
2. Commit: conventional `feat:` prefix
3. PR + CI verify (if applicable)
4. Merge → deploy
5. Smoke: HTTP 200 on prod
6. Journal entry
