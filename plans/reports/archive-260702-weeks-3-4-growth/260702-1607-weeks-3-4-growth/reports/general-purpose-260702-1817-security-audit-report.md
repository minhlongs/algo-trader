# Security Audit Report

**Date:** 2026-07-02
**Scope:** Full `pnpm audit --audit-level=high`
**Result:** 104 total vulns (6 low, 62 moderate, 36 high)

## Vulnerabilities by Category

### Direct Dependencies (can bump in package.json)

| Dep | Current | Patched | Action |
|-----|---------|---------|--------|
| **fastify** | 5.7.4 | >=5.8.5 | `"fastify": "^5.8.5"` |
| **hono** | 4.12.9 | >=4.12.25 | `"hono": "^4.12.25"` |
| **ws** | 8.19.0 | >=8.21.0 | `"ws": "^8.21.0"` |
| **better-auth** | 1.6.3 | >=1.6.11 | `"better-auth": "^1.6.11"` — review changelog for breaking changes |

### Transitive via @polymarket/clob-client (axios) — OVERRIDE

axios locked at <1.16.0. **11 HIGH advisories** total: NO_PROXY bypass, prototype pollution (response tampering, header injection, credential theft, MitM), ReDoS, resource exhaustion, credential leak on redirect.

**Fix:** `pnpm.overrides: { "axios": "^1.16.0" }`

### Transitive via wrangler — OVERRIDE

| Dep | Current | Patched | Issue |
|-----|---------|---------|-------|
| **undici** | 5.29.0 | >=6.27.0 | WebSocket DoS, memory exhaustion, unhandled exception (3 advisories) |
| **defu** | 6.1.4 | >=6.1.5 | Prototype pollution via `__proto__` |

**Fix:** `pnpm.overrides: { "undici": "^6.27.0", "defu": "^6.1.5" }` — or update wrangler to latest 3.x.

### Transitive via @opentelemetry (protobufjs) — OVERRIDE

protobufjs@7.5.5 (<7.5.6). **5 HIGH advisories**: code injection, prototype pollution gadget, DoS via recursion, DoS via Any expansion.

**Fix:** `pnpm.overrides: { "protobufjs": "^7.6.1" }`

### Transitive via vitest (vite) — OVERRIDE

vite@8.0.3 (<=8.0.15). **3 advisories**: server.fs.deny bypass, arbitrary file read via WebSocket, Windows alternate path bypass.

**Fix:** `pnpm.overrides: { "vite": "^8.0.16" }` — only used in dev/test, but still HIGH severity.

### Other Transitive — OVERRIDE

| Dep | Path | Patched |
|-----|------|---------|
| **fast-uri** | fastify -> @fastify/ajv-compiler | >=3.1.2 (path traversal, host confusion) |
| **fast-xml-builder** | @aws-sdk/client-s3 -> fast-xml-parser | >=1.1.7 (attribute injection) |
| **kysely** | better-auth | >=0.28.17 (JSON-path injection) |
| **form-data** | @types/supertest -> @types/superagent | >=4.0.6 (CRLF injection) |
| **tmp** | ioredis-mock -> fengari | >=0.2.6 (path traversal) |

## Overrides Configuration Needed

Add to package.json under `pnpm` key:

```json
"pnpm": {
  "overrides": {
    "axios": "^1.16.0",
    "vite": "^8.0.16",
    "undici": "^6.27.0",
    "protobufjs": "^7.6.1",
    "defu": "^6.1.5",
    "fast-uri": "^3.1.2",
    "fast-xml-builder": "^1.1.7",
    "kysely": "^0.28.17",
    "form-data": "^4.0.6",
    "tmp": "^0.2.6"
  }
}
```

## Key Finding

Over half the HIGH vulns (11 of 36) stem from a **single transitive dependency**: axios pinned inside `@polymarket/clob-client@5.8.0`. The CLOB client forces an old axios version that has multiple prototype pollution and credential leak vulnerabilities. An override to `^1.16.0` resolves all 11 at once.
