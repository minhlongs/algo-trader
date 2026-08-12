---
name: algo-trader-test-suite-known-baseline
description: Known-failing baseline of algo-trader vitest suite as of 2026-08-13 (22 fails / 4 files), plus the LlmRouter OmniRoute constructor landmine
metadata:
  type: project
---

# algo-trader test suite — verified baseline (2026-08-13)

`npm test` (vitest run) = 389 test files / 4236 tests. Green state is NOT zero failures.

**Known pre-existing failures — 4 files, 20 deterministic + 2 flaky:**

| File | Fails | Cause |
|---|---|---|
| `src/desk/strategies/__tests__/probability-calibrator.test.ts` | 17 | Test mocks `fetch`; source migrated to `LlmRouter`. Every test dies at 0ms on `OmniRoute violation` thrown from router constructor (test sets `http://test:11434`). |
| `src/platform/api/__tests__/comment-moderation-service.test.ts` | 1 deterministic + 2 flaky | No LLM mock at all — makes real calls. Extra 2 fail only under full-suite load as 5000ms timeouts. Isolated run = 1 fail. |
| `src/platform/api/__tests__/blog-engagement-routes.test.ts` | 1 | `submits a moderated comment (201)` |
| `tests/integration/ci-script-reference-integrity-sync.test.ts` | 1 | orphan `ci-gate-*` script not wired into CI |

**Why:** These predate the 2026-08-13 LlmRouter migration; confirmed via `git stash` A/B (identical failing-test-name sets with and without changes).
**How to apply:** When asked whether failures are new, always A/B with `git stash push -- <changed files>` and diff failing test *names*, not counts — full-suite vs isolated runs differ by 2 due to the comment-moderation timeout flake. Do not accept a handed-down "these are pre-existing" list without verifying; the list given on 2026-08-13 wrongly included `llm-content-generator` (it passes, 2/2).

**LlmRouter landmine:** `new LlmRouter()` runs `assertOmniRouteConfig()`, which throws unless every configured endpoint is the OmniRoute gateway or loopback. `llm-config.ts` adds a `cloud` endpoint at `https://api.anthropic.com/v1` whenever `CLAUDE_API_KEY` is set → router constructor throws unconditionally. Verified empirically. `CLAUDE_API_KEY` is currently unset everywhere, so it is latent, but it means any module calling `new LlmRouter()` breaks the moment that key is introduced.
