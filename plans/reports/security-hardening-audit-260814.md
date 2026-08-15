# Security Hardening Audit Report

**Date:** 2026-08-14
**Scope:** Input Validation & Error Leakage Audit
**Auditor:** Claude Code (Security Audit)

---

## Executive Summary

Security audit of algo-trader API routes identified **3 critical** and **2 low-severity** issues. All critical issues relate to error message leakage exposing internal details to API clients. SQL injection risk is minimal (parameterized queries used throughout).

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 3 | Fixed |
| Low | 2 | Documented |

---

## Findings

### 1. Error Message Leakage (CRITICAL) - FIXED

**Issue:** Multiple API routes expose internal error messages to clients via `error.message`, which may contain stack traces, database errors, or internal path information.

**Affected Files:**
- `src/platform/api/routes/revenue.ts` (lines 88, 103, 137, 168, 184)
- `src/platform/api/routes/pnl.ts` (lines 24, 42)
- `src/platform/api/routes/backtest.ts` (line 121)
- `src/platform/api/routes/co-pilot-routes.ts` (line 134)
- `src/platform/api/routes/trades.ts` (line 46)

**Fix Applied:** Replaced `error.message` with generic error strings. Internal details logged server-side only.

**Before:**
```typescript
res.status(500).json({
  error: error instanceof Error ? error.message : 'Failed to fetch data',
});
```

**After:**
```typescript
res.status(500).json({ error: 'Internal server error' });
// Internal: logger.error('[Revenue] Error', { error });
```

---

### 2. Global Error Handler Stack Trace Leakage (CRITICAL) - FIXED

**Issue:** `error-handler.ts` exposes `error.stack` in development mode. If `NODE_ENV` is misconfigured, production stack traces leak.

**File:** `src/platform/api/middleware/error-handler.ts`

**Fix Applied:** Removed stack trace from response body entirely; stack traces only logged server-side.

---

### 3. Missing Input Validation on Co-pilot Route (CRITICAL) - FIXED

**Issue:** `POST /api/v1/co-pilot/ask` accepts `req.body` without Zod validation, allowing arbitrary input shapes.

**File:** `src/platform/api/routes/co-pilot-routes.ts`

**Fix Applied:** Added Zod schema for request body validation.

---

### 4. SQL Injection (SAFE - No Fix Required)

**Finding:** All SQL queries use parameterized queries (`$1`, `$2`, etc.). The template literal usage in `blog-engagement-routes.ts` (column name interpolation) is safe because:
- Column name is derived from validated enum (`variant === 'A' ? 'clicks_a' : 'clicks_b'`)
- User input cannot influence the column name

---

### 5. Security Headers (SAFE - No Fix Required)

**Finding:**
- Helmet is applied globally in `server.ts`
- CORS configured with explicit origin whitelist (not `*`)
- Rate limiting middleware present

---

## Files Modified

| File | Change |
|------|--------|
| `src/platform/api/routes/revenue.ts` | Remove error.message leakage (5 locations) |
| `src/platform/api/routes/pnl.ts` | Remove error.message leakage (2 locations) |
| `src/platform/api/routes/backtest.ts` | Remove error.message leakage (1 location) |
| `src/platform/api/routes/co-pilot-routes.ts` | Add Zod validation, remove error.message leakage |
| `src/platform/api/routes/trades.ts` | Remove error.message leakage (1 location) |
| `src/platform/api/middleware/error-handler.ts` | Remove stack trace from response |

---

## Test Status

- TypeScript: `npx tsc --noEmit` - PASS
- Security integration tests: PASS
- API route tests: PASS
- Full test suite: 4406 passed, 12 failed (pre-existing infrastructure issues - WebSocket/DB mocks, unrelated to security fixes)

---

## Recommendations

1. **Add global error handler middleware** to all routes instead of per-route try/catch
2. **Standardize error response format** across all routes
3. **Add request ID tracking** for error correlation
4. **Consider adding Zod validation** to remaining routes using `req.body` (rum-ingest, admin routes)

---

## Unresolved Questions

None.
