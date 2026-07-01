## 2026-05-30T11:55:40Z

You are the Worker for Phase 35, Milestone 1: Multi-Tenant Audit Logging (R1).
Your working directory is `/Users/macbook/algo-trader/.agents/teamwork_preview_worker_m1`.

Objective:
Implement a persistent, secure, multi-tenant audit logging system in PostgreSQL, ensuring immutable chaining and proper concurrency advisory locking.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Steps to perform:
1. Create a migration SQL for `tenant_audit_logs` table (e.g. `src/db/migrations/021_create_tenant_audit_logs.sql`) and register it in `src/db/migration-runner.ts`. The schema should match the explorer's proposal:
   - Columns: `id` (PK), `tenant_id` (FK-like mapping to subscriber_id), `sequence_number`, `event_type`, `action_by`, `reason`, `metadata` (JSONB), `hash` (SHA-256), `previous_hash` (SHA-256), `created_at` (TIMESTAMPTZ).
   - Ensure UNIQUE constraint on `(tenant_id, sequence_number)`.
   - Index on `(tenant_id, created_at DESC)` and `(tenant_id, sequence_number DESC)`.
2. Implement a new audit log manager/service (e.g., in `src/audit/tenant-audit-log.ts` or refactor `src/audit/audit-log-service.ts`) that implements:
   - `appendTenantAuditLog(tenantId, eventType, actionBy, reason, metadata)`:
     - Execute within a PG transaction.
     - Acquire a PG transactional advisory lock: `SELECT pg_advisory_xact_lock(hashtext($1))` on `tenantId`.
     - Fetch the latest log for `tenantId` to get the preceding `sequence_number` and `hash`.
     - Compute the current SHA-256 hash using the canonical string representation of properties (including previous hash and sorted keys metadata).
     - Insert the new record.
   - A verification function `verifyTenantChain(tenantId)` that verifies the entire hash chain from sequence 1.
3. Replace existing audit log points and hook up the new logging helper at:
   - Trade decisions: `src/arbitrage/trading-loop.ts`
   - Order executions: `src/execution/order-executor.ts`
   - Trade outcomes: `src/trading-pipeline.ts`
   - Circuit breakers (trips and resets): `src/risk/circuit-breaker.ts`
   - Drawdown monitoring (breaches and resumes): `src/risk/drawdown-monitor.ts`
   - Administrative forced halts/resumes: `src/api/routes/admin.ts`
   - License operations: `src/api/routes/license-routes.ts`
4. Update/Refactor `src/api/routes/audit-routes.ts` to support querying logs and exporting them:
   - Logs query: `GET /api/v1/audit/logs`, restricted to own tenant unless admin, using keyset pagination.
   - Logs export: `GET /api/v1/audit/export`, streaming CSV/JSON using `pg-query-stream` directly to response to avoid memory issues.
5. Make sure NO `any` or `@ts-ignore` are used (use custom types/interfaces, or `unknown` where needed).
6. Write unit tests (e.g. `src/audit/__tests__/tenant-audit-chain.test.ts` or `src/api/__tests__/audit-routes.test.ts`) verifying correctness, concurrency, chain integrity, and access controls.
7. Run the test suite and verify that all tests pass and the code compiles with `npx tsc --noEmit`.
