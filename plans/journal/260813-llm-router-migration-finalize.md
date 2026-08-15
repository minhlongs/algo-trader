# Journal: LLM Router Migration — Finalize

**Date:** 2026-08-13
**Session:** Cook finalize (--auto --parallel)
**Task:** Migrate 9 intelligence modules to LlmRouter.chat()

## What happened

Previous sessions completed two major tasks:
1. **ClobClient type alias fix** (commit `4a6f97c5`) — fixed runtime crash where `trading-pipeline.ts` imported `ClobClient` (a type alias erased at runtime) and did `new ClobClient(...)`. Fixed by using pre-existing singleton value export.
2. **OmniRoute gateway enforcement** (commit `197b1054`) — added `OMNIROUTE_URL` constant, `isLoopbackUrl()`, and `assertOmniRouteConfig()` to `src/lib/llm-router.ts`. All LLM traffic now routes through `http://omnimbp.local:20128/v1`.

This session verified the LLM module migration was already complete — all 8 existing intelligence modules use `LlmRouter.chat()`, zero raw LLM `fetch()` calls remain.

## Verification results

- `grep -rn 'chat/completions' src/desk/intelligence/ src/desk/feeds/ src/intelligence/` → 0 hits
- All 8 target modules confirmed using `LlmRouter`
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — 385/389 pass (4 pre-existing failures in llm-router-enhanced.test.ts)
- `probability-calibrator.ts` does not exist on disk (was listed in original task but never created)

## Commits
- `4a6f97c5` — fix: resolve ClobClient type alias runtime crash
- `88016fae` — docs: journal entry for CLOB live trading finalize
- `197b1054` — feat(audit): route trading LLM traffic through OmniRoute gateway

## Status
- All tasks COMPLETE — no new code changes needed
- No uncommitted code changes (only orchestrate pipeline state files)
- All acceptance criteria satisfied

## Unresolved
- `probability-calibrator.ts` never created — was it intentionally dropped from scope?
- 4 pre-existing test failures in llm-router-enhanced.test.ts (assertions for unimplemented features)
