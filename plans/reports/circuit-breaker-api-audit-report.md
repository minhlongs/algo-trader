# Circuit Breaker Admin API Audit Report

## Audit Date
2026-08-16

## Issue
Runbook references `/api/admin/circuit-breakers` endpoint that does not exist in codebase.

---

## Findings

### Admin API Exists?
**PARTIAL — Route does not exist as documented.**

### Actual Admin Routes in `src/platform/api/routes/admin.ts`
- `POST /admin/halt` — halt trading
- `POST /admin/resume` — resume trading
- `GET /admin/status` — returns system status

### What `/admin/status` Returns
```json
{
  "trading": boolean,
  "circuitBreaker": { "state": "CLOSED|OPEN|HALF_OPEN" },
  "drawdown": { ... },
  "timestamp": 1234567890
}
```

Circuit breaker state is **included within `/admin/status` response**, not exposed as a standalone `/admin/circuit-breakers` endpoint.

### Runbook References Endpoints That Do Not Exist
- `GET /api/admin/circuit-breakers` — no route
- `POST /api/admin/circuit-breakers/{name}/reset` — no route
- `POST /api/admin/circuit-breakers/reset-all` — no route

---

## Go-Live Blocker?
**YES — runbook commands will fail with 404 on all restarts.**

Operators following the runbook cannot query circuit breaker state or reset breakers via the documented endpoints.

---

## Recommended Action
Add `GET /api/admin/circuit-breakers` and `POST /api/admin/circuit-breakers/{name}/reset` endpoints to `admin.ts` that delegate to `CircuitBreaker.getStatus()` and an appropriate reset method.

---

## Unresolved Questions
- Does `CircuitBreaker` class have a reset method? Need to confirm API surface.
- Should individual breaker reset be scoped to specific breakers vs global reset?