# Test Suite Report

**Date:** 2026-08-13 14:22:35
**Command:** `npm test` (vitest run)
**Duration:** 22.29s (transform 13.15s, setup 0ms, import 37.42s, tests 79.65s, environment 34ms)

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 4239 |
| Passed | 4219 |
| Failed | 20 |
| Skipped | 0 |
| Test Files | 389 |
| Pass Rate | 99.53% |
| Known Pre-existing | 20 deterministic |
| Flaky | 0 (this run) |

---

## Failures

### 1. `probability-calibrator.test.ts` — 17 failures

| Test Name | Failure Type | Error Message |
|-----------|--------------|---------------|
| should use default config when no options provided | OmniRoute violation | primary endpoint URL "http://test:11434" is not the mandatory OmniRoute gateway (http://omnimbp.local:20128/v1) |
| should override defaults with provided config | OmniRoute violation | same as above |
| should parse valid LLM response | OmniRoute violation | same as above |
| should pass context to LLM when provided | OmniRoute violation | same as above |
| should fall back to default values when LLM response is not parseable | OmniRoute violation | same as above |
| should extract JSON from mixed text response | OmniRoute violation | same as above |
| should clamp probability to [0, 1] range | OmniRoute violation | same as above |
| should throw on HTTP error from LLM API | OmniRoute violation | same as above |
| should limit concurrent requests | OmniRoute violation | same as above |
| should parse valid sentiment response | OmniRoute violation | same as above |
| should clamp sentiment to [-1, 1] range | OmniRoute violation | same as above |
| should default to medium impact for unknown impact values | OmniRoute violation | same as above |
| should return neutral values on parse failure | OmniRoute violation | same as above |
| should return fair when edge is below threshold | OmniRoute violation | same as above |
| should detect underpriced-yes when LLM estimate is higher than market | OmniRoute violation | same as above |
| should detect overpriced-yes when LLM estimate is lower than market | OmniRoute violation | same as above |
| should handle edge case where estimated prob equals market price | OmniRoute violation | same as above |

**Root Cause:** Source migrated to `LlmRouter` which runs `assertOmniRouteConfig()`. Tests mock `fetch` but not the constructor — every test dies at 0ms in `new LlmRouter()`.

---

### 2. `blog-engagement-routes.test.ts` — 1 failure

| Test Name | Failure Type | Error Message |
|-----------|--------------|---------------|
| submits a moderated comment (201) | Timeout | Test timed out in 5000ms |

**Root Cause:** LLM mock absent — makes real calls that exceed 5s under load.

---

### 3. `comment-moderation-service.test.ts` — 1 failure (this run)

| Test Name | Failure Type | Error Message |
|-----------|--------------|---------------|
| rejects spam comments with blocked keywords | Timeout | Test timed out in 5000ms |

**Root Cause:** No LLM mock — makes real API calls. This test is flaky; typically 1 deterministic + 2 flaky under full-suite load. This run: 1 fail (flakes didn't trigger).

---

### 4. `ci-script-reference-integrity-sync.test.ts` — 1 failure

| Test Name | Failure Type | Error Message |
|-----------|--------------|---------------|
| no orphan `ci-gate-*` scripts | Assertion | `scripts/ci-gate-local.mjs` has 'ci-gate-' prefix but is NOT referenced by ci.yml |

**Root Cause:** Orphan script file exists that isn't wired into CI workflow.

---

## Categorization

| Category | Count | Files |
|----------|-------|-------|
| OmniRoute violation (constructor) | 17 | probability-calibrator.test.ts |
| Timeout (missing LLM mock) | 2 | blog-engagement-routes, comment-moderation-service |
| CI integrity assertion | 1 | ci-script-reference-integrity-sync |
| **Total** | **20** | |

---

## Known Baseline Match

All 20 failures match the pre-existing baseline documented in `algo-trader-test-suite-known-baseline.md`:

- **Expected deterministic fails:** 20
- **This run:** 20 deterministic
- **Flaky fails this run:** 0 (underlying flake potential remains in `comment-moderation-service`)

**Verdict: No new regressions.**

---

## Recommendations

| Priority | Action | Impact |
|----------|--------|--------|
| P1 | Update `probability-calibrator.test.ts` to mock `LlmRouter` constructor or patch `assertOmniRouteConfig` | Fixes 17 tests |
| P1 | Add LLM mock to `comment-moderation-service.test.ts` and `blog-engagement-routes.test.ts` | Fixes 2 timeouts + eliminates flake |
| P2 | Wire `scripts/ci-gate-local.mjs` into `.github/workflows/ci.yml` or delete the file | Fixes 1 CI integrity test |
| P3 | Investigate `LlmRouter` landmine: `CLAUDE_API_KEY` set → `new LlmRouter()` throws unconditionally | Latent production risk |

---

## Unresolved Questions

1. Is `scripts/ci-gate-local.mjs` intentionally excluded from CI, or is it an orphan that should be cleaned up?
2. Should `probability-calibrator` tests use a test-only `LlmRouter` bypass, or should they mock at the `fetch` level with router stub?
3. The 2 flaky timeout tests in `comment-moderation-service` — should they get a dedicated `vi.useFakeTimers()` setup to eliminate timing dependency entirely?
