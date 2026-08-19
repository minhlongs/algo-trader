# Rate-Limiter Catch Narrowing: Evaluated and Declined

**Date:** 2026-08-19
**Severity:** N/A (decision record)
**Component:** forest/rate-limit/redis-rate-limiter
**Status:** Declined — code unchanged

## Origin

The code-reviewer subagent returned a **non-blocking suggestion** on commit `3f0b937d`:

> Narrow the `catch` in `redis-rate-limiter.ts:159` to specific Redis client error
> codes instead of catching all errors. Current behavior is safe (programming
> errors would surface as a fallback allowance, logged with the cause), but
> narrower catch is cleaner.

## Evaluation

Before acting, I scouted the Redis error surface rather than assuming the
reviewer's framing.

**Error hierarchy discovered** (`node_modules/ioredis/built/errors/`):
- `MaxRetriesPerRequestError extends AbortError extends RedisError`
- `redis-errors` package exposes: `RedisError`, `ParserError`, `ReplyError`,
  `AbortError`, `InterruptError`

**Three obstacles to the suggested change:**

1. **Type-system friction.** `node_modules/@types/redis-errors` is missing and
   ioredis's `.d.ts` does not re-export the error classes. Importing
   `redis-errors` yields an untyped CommonJS module — a zero-`:any` violation
   unless an exception is approved.

2. **It would break two existing tests.** Both fallback tests throw plain
   `Error` objects:
   - `pipeline: () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); }`
   - `zcard: async () => { throw new Error('Connection lost mid-read'); }`

   Narrowing to `instanceof` Redis error classes fails both. Real regression
   risk, and `HARD-GATE-NO-SIDE-EFFECTS` forbids silently patching around it.

3. **The theoretical risk does not exist here.** I walked the `try` block
   line by line. It calls only `getRedisClient()`, `redis.pipeline()`, the
   four pipeline commands, `pipeline.exec()`, `redis.zcard()`, `logger.warn()`,
   and `emitRateLimitAuditEvent()` — the last already wrapped in its own
   `try/catch`. There is **no user-written business logic** inside the `try`
   block. Every failure mode is Redis unreachability. A `TypeError` from
   accessing a property on a non-existent client cannot occur.

## Decision

**Declined. Code left unchanged.**

The reviewer's concern — "programming errors would surface as a fallback
allowance" — is predicated on user code being reachable inside the `try`
block. There is none. The `catch` is already correct: it logs the cause, and
the fallback preserves per-user, tier-resolved rate limiting.

## Alternative considered (rejected)

Narrow via `instanceof Error` + message feature-detection, patching both test
stubs to throw real `redis-errors` instances. Rejected because it costs two
test modifications and an untyped import for zero behavioral gain.

## Verification

No change was made, so no new verification is owed. The existing suite
remains green:

- `vitest src/forest/rate-limit/` — 23/23 pass
- `vitest src/shared/rate-limit/__tests__/memory-fallback.test.ts` — 10/10 pass
- `tsc -p tsconfig.json` — 3 pre-existing errors, 0 new
- `eslint` — 0 new errors

## Lesson

A reviewer's "cleaner" suggestion is a hypothesis, not a finding. Test it
against the actual code path before applying it. Here the cost (2 broken
tests, a type violation) exceeded the benefit (none), so the suggestion was
returned to the reviewer with evidence rather than implemented.