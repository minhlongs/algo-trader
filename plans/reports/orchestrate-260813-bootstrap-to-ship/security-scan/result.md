# Security Scan Report

## Summary

- **Critical:** 1
- **High:** 2
- **Medium:** 4
- **Low:** 3
- **Total findings:** 10

## Findings

| # | Severity | Category | File | Line(s) | Description |
|---|----------|----------|------|---------|-------------|
| 1 | CRITICAL | Secret Exposure | `.claude/.env` | 7 | Contains real GEMINI_API_KEY (`AIzaSyCYOf2VudrR3aRSO7xZiBe4-UQp_eg6_KU`). File is not git-tracked (good), but `.claude/.env` is not listed in `.gitignore` — a future `git add .` or IDE auto-index could leak it. |
| 2 | HIGH | SQL Injection (Latent) | `src/platform/marketplace/repositories/tenant-repository.ts` | 54-60 | `update()` iterates `Object.entries(data)` and interpolates keys directly into SQL: `` `${key} = $${idx++}` ``. No column-name allowlist. If any caller passes user-controlled keys, this is exploitable. Contrast with `provider-repository.ts` which correctly whitelists fields. |
| 3 | HIGH | CORS Misconfiguration | `src/platform/workers/api/markets.ts` | 31-38 | `corsHeaders()` reads `ALLOWED_ORIGINS`, splits by comma, but only uses `allowed[0]`. If multiple origins are configured, all but the first are silently ignored. Same pattern in `copilot.ts:436`, `telegram-bot.ts:35`. Additionally, all worker CORS responses omit `Access-Control-Allow-Credentials` and `Access-Control-Max-Age`. |
| 4 | MEDIUM | Data Exposure | `src/platform/api/middleware/error-handler.ts` | 29-31 | Returns `err.message` verbatim in API response body. Internal error messages can leak stack traces, file paths, SQL errors, or dependency versions. Should sanitize for non-admin callers. |
| 5 | MEDIUM | Type Safety | `src/platform/workers/api/coupons.ts` | 16-17 | Handler signature is `(request: Request, env: any)` — full `any` bypass on the env parameter, then repeated `(env as any).CACHE` casts (lines 28, 63, 83, 108). Violates zero-`:any` quality gate. A `CACHE` typo would silently return `undefined`. |
| 6 | MEDIUM | Auth Trust Boundary | `src/platform/middleware/auth-middleware.ts` | 107-109 | Global middleware explicitly never rejects — missing/invalid JWT silently passes as anonymous FREE tier. Contract says "routes enforce authz" but requires every route author to remember this. A single forgotten `assertTenantAccess` call creates an open endpoint. |
| 7 | MEDIUM | CORS Wildcard Origin | `src/platform/workers/coupon-handlers.ts`, `edge-proxy.ts`, `stats-handler.ts`, `webhook-handlers.ts` | various | Four worker files hardcode `'Access-Control-Allow-Origin': 'https://cashclaw.cc'` instead of using the `ALLOWED_ORIGINS` env-based pattern. If the production domain changes, these files must be manually updated. |
| 8 | LOW | Config Timing | `src/platform/middleware/admin-auth.ts` | 8-12 | `ADMIN_API_KEYS` Set is populated once at module load from `process.env`. Rotating keys requires a full process restart. Not exploitable, but limits operational flexibility. |
| 9 | LOW | Test-Only Secrets | `src/desk/execution/__tests__/` | various | Test files assign `process.env.POLY_API_KEY = 'old-key'` etc. These are fake values (good) but tests should clean up env vars in `afterEach` to prevent cross-test contamination. |
| 10 | LOW | eval() Usage | `.claude/skills/chrome-devtools/scripts/evaluate.js` | 33 | Uses `eval()` for script execution. This is in a skill script (not production code), and the test suite explicitly tests for injection blocking. Acceptable for tooling context but should be documented. |

## Banned Imports

No banned imports (`@/lib/auth`, `@/lib/subscription`, `@/lib/unified-tier-config`, `@/lib/tier-gate`) found in the codebase. **PASS.**

## .gitignore Coverage

| Pattern | Status |
|---------|--------|
| `.env` | Listed |
| `.env.production` | Listed |
| `.env.local` | Listed |
| `.env.*.local` | Listed |
| `.claude/.env` | **NOT listed** |
| `.claude/.env.example` | Not listed (acceptable — example has no secrets) |

## SQL Injection Analysis

- **Parameterized queries:** The vast majority of DB access uses `$1`, `$2`... positional parameters. **PASS** on the primary attack surface.
- **Dynamic column construction:** `tenant-repository.ts` uses unsanitized `Object.keys(data)` in column names. `provider-repository.ts` correctly whitelists fields.
- **Redis eval:** `distributed-nonce-manager.ts:155` uses Redis Lua eval with `KEYS[1]`/`ARGV[1]` — this is the standard safe pattern for Redis scripting.

## Recommendations

1. **(Critical) Rotate the exposed Gemini key immediately.** Add `.claude/.env` to `.gitignore`. Consider using a `.gitignore` template that covers all possible `.env` locations (`.claude/**/.env`, `**/.env`).
2. **(High) Add column-name allowlist to `tenant-repository.ts` `update()`.** Follow the same pattern as `provider-repository.ts`: explicitly list valid column names, reject unknown keys.
3. **(High) Fix CORS to support multiple origins.** Return the matching origin from the request's `Origin` header against the allowlist, instead of always returning `allowed[0]`. Add `Access-Control-Max-Age: 86400` to reduce preflight overhead.
4. **(Medium) Sanitize error responses.** In `error-handler.ts`, return generic messages to non-admin callers; log full details server-side only.
5. **(Medium) Replace `env: any` with proper `Env` type in `coupons.ts`.** The `Env` type is already defined in the file but not used in the function signatures.
6. **(Medium) Add a startup assertion** that validates all required env vars are set, reducing silent misconfiguration risk from the trust-boundary design.
7. **(Low) Unify CORS pattern** across all worker handlers to use the env-based `corsHeaders()` helper instead of hardcoded origin strings.

## Metrics

- **Type Safety:** `:any` in production `src/` — 1 file (`coupons.ts` handler signatures). Worker files have 4 `as any` casts. `worker-configuration.d.ts` `any` usage is excluded (Cloudflare auto-generated).
- **Console Logging:** Zero `console.log`/`warn`/`error` in `src/`. Matches in `.opencode/` skill scripts and `worker-configuration.d.ts` only.
- **Test Secret Cleanup:** 0/6 test files that set `process.env.*_KEY` perform cleanup.
- **Hardcoded URLs with Credentials:** None found.

## Unresolved Questions

1. Is `tenant-repository.ts` `update()` ever called with externally-supplied data? No call sites were found in route handlers, but it is exported and could be called from services added later. Treat as latent risk.
2. Should the Cloudflare Workers handlers (coupons, markets, etc.) be migrated to use the same `helmet`/`cors` middleware stack as the Express server, or is the per-handler CORS acceptable for the Workers deployment model?
3. The `.env.local` and `.env` files contain local dev database credentials (`algo:algo_local`). Are these rotated for any shared environments, or are they purely local Docker-only?
