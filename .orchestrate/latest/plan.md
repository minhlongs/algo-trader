# Plan — Enforce OmniRoute in src/lib/llm-router.ts

(Reconstructed from the completed diff for result-gate review — no separate
kongming plan.md was persisted to disk before execution for this task.)

## Scope
- `src/lib/llm-router.ts`
- `src/shared/config/llm-config.ts` (endpoint URL defaults `LlmRouter` consumes)
- Tests that construct `LlmRouter` with literal non-OmniRoute hostnames
- `wrangler.toml` staging var wiring for `OMNIROUTE_URL`

## Steps
1. Add `export const OMNIROUTE_URL = process.env.OMNIROUTE_URL || 'http://omnimbp.local:20128/v1'`
   to `llm-router.ts`.
2. Add `assertOmniRouteConfig(config)` — for every configured endpoint
   (primary/fastTriage/fallback/qwen/cloud), require `url === OMNIROUTE_URL`
   or `isLoopbackUrl(url)` (localhost/127.0.0.1/0.0.0.0 on any port), else
   throw `OmniRoute violation: ...`.
3. Call `assertOmniRouteConfig(this.config)` in the `LlmRouter` constructor,
   after `loadLlmConfig()` merge, so it validates the final resolved config
   (both defaults and any `Partial<LlmConfig>` override passed in).
4. Wire `OMNIROUTE_URL` into `loadLlmConfig()` (`llm-config.ts`) as the shared
   default for `primary`/`fastTriage`/`fallback`/`qwen` endpoint URLs, so the
   four independent `LLM_*_URL` env vars no longer hardcode the literal
   separately — closes the drift gap where changing `OMNIROUTE_URL` alone
   would not update the endpoints and would trip the new constructor guard.
5. Update existing tests that constructed `LlmRouter` with non-loopback,
   non-OmniRoute literal hostnames (`http://deepseek:11435`,
   `http://nemotron:11436`, `http://ollama:11434`) to use loopback
   equivalents, since those are legacy fixtures, not real enforcement
   targets.
6. Add a dedicated `llm-router.test.ts` covering: OmniRoute URL passes,
   loopback (127.0.0.1/localhost) passes, non-OmniRoute/non-loopback throws
   with `/OmniRoute violation/`, per-endpoint-name violation message, and the
   `OMNIROUTE_URL` constant value itself.
7. Add `OMNIROUTE_URL` to `wrangler.toml` `[env.staging.vars]` so staging can
   route through a Cloudflare Tunnel hostname instead of the LAN-only mDNS
   address.

## Definition of Done
- `npx tsc --noEmit` — 0 errors.
- `npx vitest run` on the touched/added `llm-router*` test files — all green.
- No unrelated production call site (`new LlmRouter()` with no args) starts
  throwing, since all default endpoints now resolve to the same
  `OMNIROUTE_URL` value.
