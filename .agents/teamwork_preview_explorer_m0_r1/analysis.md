# R1 (Multi-Tenant Audit Logging) Analysis & Architecture Proposal

## Overview
This document presents the technical analysis and architectural design for a persistent, secure, and immutable **Multi-Tenant Audit Logging** system. The proposal addresses:
1. Moving from in-memory maps and single-tenant JSONL log files to a persistent PostgreSQL backend.
2. Tenant-level isolation (scoped by `tenantId` / `subscriber_id`).
3. Immutability through a tenant-specific SHA-256 hash chain.
4. Concurrency protection via Postgres Transactional Advisory Locks.
5. REST API query query optimization and CSV/JSON export streaming.
6. Core codebase audit log injection hook locations (trade decisions, order execution, circuit breakers, and administrative state changes).

---

## 1. Database Schema Design

To ensure persistence and enable rapid query and filtering, we will introduce a new table `tenant_audit_logs`.

```sql
-- Migration: 021_create_tenant_audit_logs.sql
CREATE TABLE IF NOT EXISTS tenant_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,      -- subscriber_id or license_id
    sequence_number INTEGER NOT NULL,    -- 1-based incrementing ID per tenant
    event_type VARCHAR(64) NOT NULL,      -- category of the audit event
    action_by VARCHAR(128) NOT NULL,     -- identifier of user, API key, or 'system'
    reason TEXT NOT NULL,                -- human-readable details
    metadata JSONB DEFAULT '{}'::jsonb,  -- flexible JSON fields (prices, size, signals, etc.)
    hash VARCHAR(64) NOT NULL,           -- SHA-256 hash of this entry
    previous_hash VARCHAR(64) NOT NULL,  -- Hash of previous entry for this tenant ('0' if sequence = 1)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicates and sequence skipping for a tenant
    CONSTRAINT unique_tenant_sequence UNIQUE (tenant_id, sequence_number)
);

-- Performance and tenant-isolation indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_ts 
    ON tenant_audit_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_seq 
    ON tenant_audit_logs(tenant_id, sequence_number DESC);
```

---

## 2. Immutable Hash Chain with Concurrency Protection

### 2.1 Hash Generation Formula
To prevent tampering, each log entry embeds a SHA-256 hash computed over its primary parameters, including the hash of the preceding entry in the tenant's chain.
$$\text{hash} = \text{SHA256}(id + | + tenant\_id + | + sequence\_number + | + timestamp + | + event\_type + | + action\_by + | + reason + | + metadata\_json + | + previous\_hash)$$
*Note: The `metadata_json` must be stringified using a deterministic (sorted keys) serializer to ensure consistent hash verification.*

### 2.2 Concurrency Advisory Locking
If two threads attempt to log events for the same tenant concurrently, both may read the same `previous_hash` and generate the same `sequence_number`, resulting in a chain fork (violating the unique constraint or integrity).
We will solve this by acquiring a **PostgreSQL Transactional Advisory Lock** on the tenant ID hash before evaluating the sequence number and computing the hash chain.

```typescript
import { PoolClient } from 'pg';
import crypto from 'crypto';

export async function appendTenantAuditLog(
  client: PoolClient,
  tenantId: string,
  eventType: string,
  actionBy: string,
  reason: string,
  metadata: Record<string, unknown>
): Promise<void> {
  // 1. Advisory Lock serialized by tenant ID (non-blocking for other tenants)
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);

  // 2. Query previous entry
  const prevResult = await client.query(`
    SELECT sequence_number, hash 
    FROM tenant_audit_logs 
    WHERE tenant_id = $1 
    ORDER BY sequence_number DESC 
    LIMIT 1
  `, [tenantId]);

  let nextSequence = 1;
  let previousHash = '0';

  if (prevResult.rows.length > 0) {
    nextSequence = prevResult.rows[0].sequence_number + 1;
    previousHash = prevResult.rows[0].hash;
  }

  const id = `audit_${tenantId}_${nextSequence}_${Date.now()}`;
  const timestamp = new Date().toISOString();
  
  // Sort metadata keys for deterministic hashing
  const canonicalMetadata = JSON.stringify(metadata, Object.keys(metadata).sort());

  // 3. Compute Hash
  const payload = [
    id,
    tenantId,
    nextSequence.toString(),
    timestamp,
    eventType,
    actionBy,
    reason,
    canonicalMetadata,
    previousHash
  ].join('|');
  const hash = crypto.createHash('sha256').update(payload).digest('hex');

  // 4. Insert log entry
  await client.query(`
    INSERT INTO tenant_audit_logs (
      id, tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [id, tenantId, nextSequence, eventType, actionBy, reason, metadata, hash, previousHash, timestamp]);
}
```

---

## 3. Codebase Hook Locations (Audit Injection Points)

We have mapped where trade decisions, orders, and configuration changes happen:

| System / Category | Description | File Path & Line Numbers | Proposed Audit Action |
|---|---|---|---|
| **Trade Decisions** | Arbitrage opportunity detected with high confidence. | `src/arbitrage/trading-loop.ts` (Lines 235-267) | Log a `trade_decision` audit entry indicating that an opportunity met the execution threshold. |
| **Order Placements & Executions** | Placements, fills, and execution status of trade legs. | `src/execution/order-executor.ts` (Lines 66-100+) | Log `order_executing`, `order_filled`, or `order_failed` for each leg, storing tx hash in metadata. |
| **Trade Outcomes** | Completed trade PnL tracking and equity updates. | `src/trading-pipeline.ts` (Lines 79-101) | Replace the legacy in-memory `ImmutableTradeAudit` append with the database-backed `appendTenantAuditLog`. |
| **Circuit Breakers** | Auto-tripping due to loss streaks, high latency, or volatility. | `src/risk/circuit-breaker.ts` (Lines 143-154) | Log `circuit_breaker_tripped` with the triggering parameters and details. |
| **Circuit Breakers** | Manual reset of the circuit breaker state. | `src/risk/circuit-breaker.ts` (Lines 167-180) | Log `circuit_breaker_reset` detailing the admin identity. |
| **Drawdown Breaches** | Automated daily or total drawdown breaches forcing halts. | `src/risk/drawdown-monitor.ts` (Lines 197-207) | Log `drawdown_halt` containing the daily PnL and breach threshold. |
| **Drawdown Resumes** | Admin manual resume / restart of drawdown monitoring. | `src/risk/drawdown-monitor.ts` (Lines 211-224) | Log `drawdown_resume` detailing starting equity. |
| **Admin Overrides** | Administrative forced halt / resume REST endpoints. | `src/api/routes/admin.ts` (Lines 27-58) | Log `manual_halt` or `manual_resume` indicating the request source and reason. |
| **License Management** | License key creation, revocation, and deletion events. | `src/api/routes/license-routes.ts` (Lines 90-137) | Log `license_created`, `license_revoked`, and `license_deleted` events. |

---

## 4. REST API Endpoint Designs & Exporting Strategy

### 4.1 Log Query API
- **Endpoint**: `GET /api/v1/audit/logs`
- **Security**: Bound to `assertTenantAccess(subscriberId, tokenSubscriberId, isAdmin)`. Callers can only view logs matching their own `subscriber_id` unless they are admins.
- **Filtering**: Supports `eventType`, `startDate`, and `endDate`.
- **Pagination**: Use keyset pagination (i.e. `created_at` or `sequence_number` cursor) to avoid slow queries associated with high SQL offset counts.
  - Query: `WHERE tenant_id = $1 AND sequence_number < $2 ORDER BY sequence_number DESC LIMIT 100`

### 4.2 Stream-Based JSON/CSV Export API
- **Endpoint**: `GET /api/v1/audit/export`
- **Query Params**: `format` (csv/json), `startDate`, `endDate`.
- **Implementation Strategy**: Rather than reading thousands of log entries into memory (which risks Node process heap overflows), we should utilize PostgreSQL streams or `pg-query-stream`. This processes database results cursor-by-cursor and writes them dynamically to the Express `Response` stream.

```typescript
import QueryStream from 'pg-query-stream';
import { Transform } from 'stream';

// In route handler:
const sql = 'SELECT * FROM tenant_audit_logs WHERE tenant_id = $1 ORDER BY sequence_number ASC';
const queryStream = new QueryStream(sql, [tenantId]);
const dbClient = await pool.connect();

const transformToCsv = new Transform({
  writableObjectMode: true,
  transform(row, encoding, callback) {
    if (!this.headersSent) {
      this.push('id,sequence_number,timestamp,event_type,action_by,reason,metadata,hash\n');
      this.headersSent = true;
    }
    const metadataStr = JSON.stringify(row.metadata).replace(/"/g, '""');
    this.push(`${row.id},${row.sequence_number},${row.created_at.toISOString()},${row.event_type},${row.action_by},"${row.reason}","${metadataStr}",${row.hash}\n`);
    callback();
  }
});

res.setHeader('Content-Type', 'text/csv');
res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${tenantId}.csv"`);

dbClient.query(queryStream);
queryStream
  .pipe(transformToCsv)
  .pipe(res)
  .on('finish', () => dbClient.release());
```

---

## 5. Verification & Testing Plans

We propose a multi-layered verification strategy:

1. **Unit Testing Hash Chains (`src/audit/__tests__/tenant-audit-chain.test.ts`)**:
   - Write tests simulating sequences of log appends and verify the SHA-256 chain integrity is mathematical sound.
   - Intentionally corrupt a database record's `hash` or `previous_hash` and confirm the `verifyTenantChain` helper detects the integrity breach and identifies the exact index.
2. **Concurrency Verification (`src/audit/__tests__/concurrency-lock.test.ts`)**:
   - Run 10-20 concurrent `appendTenantAuditLog` requests in parallel (using `Promise.all`) for the *same* tenant.
   - Verify that advisory locking correctly sequences them so there are no duplicate sequence numbers, unique constraint violations, or hash forks.
3. **Tenant Isolation Verification (`src/api/__tests__/audit-isolation.test.ts`)**:
   - Write integration tests making requests with `tokenSubscriberId = 'tenant-A'` and requesting `/api/v1/audit/logs?licenseId=tenant-B`.
   - Ensure the API throws a `403 Forbidden` error.
4. **Export Streaming Verification (`src/api/__tests__/audit-export.test.ts`)**:
   - Seed the database with 2,000 logs.
   - Request the CSV export and check that the resulting stream starts with the CSV headers and ends cleanly with the 2000th record.
