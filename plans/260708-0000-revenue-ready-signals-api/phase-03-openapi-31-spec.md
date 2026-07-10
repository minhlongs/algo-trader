# Phase 3: OpenAPI 3.1 Spec for Signals API

**Priority:** Low — documentation only, no runtime dep
**Dependencies:** Phase 1 (route consolidation) for canonical paths
**Mode:** Standard (no TDD needed — static files)

## Overview

Write machine-readable + human-readable API documentation covering all public Signals API endpoints. No runtime dependency — two static files in `docs/`.

## Deliverables

1. `docs/openapi-signals-api.json` — Raw OpenAPI 3.1 JSON
   - `openapi: "3.1.0"` top-level key
   - All paths: `/api/v1/signals/subscribe`, `/api/v1/signals/feed`, `/api/v1/signals/webhook`, `/api/v1/signals/subscriptions/active`, `/api/v1/signals/subscriptions/:tenantId`
   - Auth: `Bearer` API key schema
   - Tier matrix in `components.schemas`
   - Rate limits per endpoint
   - Request/response examples for each endpoint

2. `docs/api-reference-v2.md` — Human-readable markdown
   - Endpoint table with method, path, auth, rate limit, tier requirement
   - Request body schema (Zod → markdown table)
   - Response shape + examples
   - Error codes: 401, 403, 404, 429
   - How to obtain API key via NOWPayments IPN

## File Locations

| File | Purpose |
|------|---------|
| `docs/openapi-signals-api.json` | Machine-readable spec |
| `docs/api-reference-v2.md` | Human-readable docs (update existing file) |

## TDD Steps

1. **Baseline:** `npx vitest run` → confirm 1340+ green
2. **Audit final routes:** After Phase 1, grep all `router.(get|post|put|delete)` in signal files → list every public path
3. **Write OpenAPI JSON:** Manually author spec referencing actual route handlers + Zod schemas
4. **Write markdown docs:** Convert JSON spec to readable markdown with examples
5. **Validate:** Confirm `openapi: "3.1.0"` key present, no `$ref` dangling
6. **Final verification:** Full suite + build

## Success Criteria

- `openapi-signals-api.json` has valid 3.1.0 structure
- Every public signal endpoint documented with request/response shapes
- `api-reference-v2.md` covers auth flow, pricing, rate limits, error codes
- 1340+ tests pass, build 0 errors

## Out of Scope

- Dynamic `/api/openapi.json` serve endpoint (could add later)
- Swagger UI (no deps, not needed for B2B)
- Client SDK generation
