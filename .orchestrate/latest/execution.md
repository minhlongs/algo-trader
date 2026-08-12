# Execution Log — Enforce OmniRoute in src/lib/llm-router.ts

Status: complete. All verification commands run 2026-08-12 on branch `main`.

## Changes made
- [x] `src/lib/llm-router.ts`: added `export const OMNIROUTE_URL`
  (env-overridable, default `http://omnimbp.local:20128/v1`), `isLoopbackUrl()`,
  and `assertOmniRouteConfig()` checking all 5 endpoint slots
  (primary/fastTriage/fallback/qwen/cloud); throws `OmniRoute violation` with
  the offending endpoint name if a URL is neither `OMNIROUTE_URL` nor
  loopback. Guard called in the `LlmRouter` constructor after config merge.
- [x] `src/shared/config/llm-config.ts`: `loadLlmConfig()` now derives all
  endpoint URL defaults from a single `omniRouteUrl` constant
  (`OMNIROUTE_URL` env var), fixing the drift gap where the 4 separate
  `LLM_*_URL` env vars independently hardcoded the literal. Also: cloud
  timeout 60s→120s, `healthCheckIntervalMs` now env-configurable.
- [x] `tests/lib/llm-router-fast-chat.test.ts`: legacy bare-metal-port
  fixtures (`deepseek:11435`, `nemotron:11436`, `ollama:11434`) switched to
  loopback `127.0.0.1` URLs; hostname-assertion call removed (replaced by
  `result.model` assertion).
- [x] `src/lib/__tests__/llm-router-qwen.test.ts`: one extra assertion added
  (indented inconsistently — cosmetic only).
- [x] NEW `src/lib/__tests__/llm-router.test.ts`: 6 constructor-enforcement
  tests — OmniRoute URL passes; loopback (127.0.0.1/localhost) passes;
  non-OmniRoute/non-loopback primary throws; non-OmniRoute fallback throws
  with endpoint name in the message; `OMNIROUTE_URL` constant exact value.
- [x] `wrangler.toml`: added `OMNIROUTE_URL` under `[env.staging.vars]`.
  **NOTE: placeholder value `"https://<tunnel-hostname>/v1"` — staging deploy
  will hard-crash `LlmRouter` construction until a real tunnel hostname is
  set.**

## Verification (all run 2026-08-12)
- `npx tsc --noEmit` — exit 0, zero errors.
- `npx vitest run src/lib/__tests__/llm-router.test.ts
  src/lib/__tests__/llm-router-qwen.test.ts tests/lib/llm-router-fast-chat.test.ts`
  — 3 files, 20 tests, all passed.
- Full suite `npx vitest run`: 4232 passed / 4 failed out of 4236.
  The 4 failures are PRE-EXISTING and NOT caused by this change (verified by
  re-running them against the stashed baseline with the OmniRoute diff
  reverted — same failures):
  - `src/desk/jobs/__tests__/llm-content-generator.test.ts` (timeout 15s)
  - `src/platform/api/__tests__/blog-engagement-routes.test.ts` (timeout 5s)
  - `src/platform/api/__tests__/comment-moderation-service.test.ts` (timeout 5s)
  - `tests/integration/ci-script-reference-integrity-sync.test.ts`
    (`scripts/ci-gate-local.mjs` not referenced by `ci.yml`)
- `new LlmRouter()` call sites (`src/desk/jobs/llm-content-generator.ts`,
  `src/strategies/llm-trading-strategy.ts`,
  `src/platform/api/routes/comment-moderation-service.ts`): unaffected — all
  default endpoints resolve to `OMNIROUTE_URL` via `loadLlmConfig()`.

## Uncommitted state on `main` (SHIP blocker, see result-verdict.md)
- Local `main` is 1 commit ahead of `origin/main`
  (`197b10543 feat(audit): route trading LLM traffic through OmniRoute gateway`).
- Working-tree diff includes OmniRoute files plus `src/desk/strategies/loader.ts`
  (registers `llm-assisted` strategy) and untracked
  `src/strategies/llm-trading-strategy.ts` + `src/strategies/__tests__/` —
  these belong to the LLM-trading-strategy work, NOT this task's scope.
- Untracked `src/desk/strategies/loader.ts.bak` should be deleted.
- Standing P0 (out of scope, already flagged): `.claude/settings.json`
  git-tracked with `ANTHROPIC_AUTH_TOKEN` in a PUBLIC repo.
