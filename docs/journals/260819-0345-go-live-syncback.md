# Go-Live Sync-Back: Rate-Limiter Fallback + Plan Recovery

**Date:** 2026-08-19
**Severity:** Low
**Component:** resilience (rate-limiting) + docs (go-live plan)
**Status:** Complete

## What Happened

Three commits landed on `fix/migration-026-nested-aggregate`, closing the last open items from the alpha-lab quality-debt session:

1. **`3f0b937d` feat: add in-memory LRU fallback for Redis rate-limiter** — `RedisRateLimiter.checkRateLimit` now delegates to `MemoryRateLimiter` when Redis is unreachable, instead of throwing or allowing the request. The fallback is per-user, tier-resolved (same `requestsPerMin` as the Redis path), and the MASTER/unlimited shortcut is evaluated before the try block so it is unaffected. Re-exports `MemoryRateLimiter`, `memoryRateLimiter`, `MEMORY_FALLBACK_CONFIG`, and both result types from `forest/rate-limit/index.ts`.
2. **`d0ae0594` docs: restore lost plan sections** — Sections 3–9 of `plans/260816-0340-go-live-checklist/plan.md` were dropped by a `git checkout --theirs` during a merge conflict. Recovered from `stash@{0}` via `git show "stash@{0}:<path>"` (the `git stash show -p` form errors out with "Too many revisions specified"). Merged cleanly; updated question #7 to mark the fallback implemented.
3. **`8e5c8ed2` docs: add alpha-lab quality-debt journal entry** — the 2026-08-16 journal entry from the prior session, which had never been committed.

## Verification

- `vitest src/forest/rate-limit/` — 23/23 pass
- `vitest src/shared/rate-limit/__tests__/memory-fallback.test.ts` — 10/10 pass
- `tsc -p tsconfig.json` — 3 errors, **all pre-existing** (alpha-backtest-adapter.ts, mock-candles.ts timestamp mismatch; migration-runner missing module). Zero from this work. Touched files are clean.
- `eslint` — 0 new errors; 1 pre-existing warning (`express-middleware.ts:44` `'prefix' unused`)
- code-reviewer subagent: **PASS** — all 7 acceptance criteria met. Non-blocking suggestion: narrow the catch to specific Redis error codes.

## Decisions

- **Branch frontmatter corrected.** `plan.md` declared `branch: feat/bootstrap-quality-pipeline` but commits landed on `fix/migration-026-nested-aggregate`. Updated the frontmatter to match reality. The plan's "Merge to main" instruction still names `feat/bootstrap-quality-pipeline` — left untouched, since choosing which branch merges is a user decision, not a doc-consistency fix.
- **Plan status stays `in-progress`.** All 22 checkboxes are manual/human gates (Sentry secrets, 12k RPS load test, TLS verification, merge to main). Nothing here is autonomously completable.

## Lessons Learned

- `git stash show -p stash@{N} -- <path>` is the wrong incantation. Use `git show "stash@{N}:<path>"` to read a single file from a stash — it returns the full file content even when the stash is a merge commit.
- A code-reviewer PASS with zero findings is worth recording explicitly. It is the evidence that the fallback does not widen rate limits, stays per-user, and leaves the Redis hot path byte-identical.