# Project: Compliance & Security Hardening Framework

## Architecture
The framework hardens the Algo-Trader RaaS dashboard to meet strict security and compliance standards.
1. **Multi-Tenant Audit Logging (R1)**: A tenant-isolated, immutable audit trail for trade decisions, orders, and system configurations. Uses a SHA-256 hash chain per tenant to guarantee tamper detection. Supports quick API querying and CSV/JSON export.
2. **Redis Distributed Rate Limiter (R2)**: Sliding window rate limiting implemented on a Redis Cluster (ports 7000-7005). Scopes limits dynamically based on the tenant's tier: FREE, PRO, or ENTERPRISE, returning HTTP 429 upon violations.
3. **AES-256-GCM Encryption at Rest (R3)**: Automatic encryption of sensitive fields (API keys, secrets, exchange credentials) at the database layer (PostgreSQL) using AES-256-GCM, with automatic decryption at runtime.

## Code Layout
- `src/audit/`: Audit log service, immutable chain storage, validators, and exporters.
- `src/api/routes/audit-routes.ts`: REST endpoints for querying and exporting audit logs.
- `src/resilience/rate-limiter.ts` & `src/api/middleware/rate-limiter-middleware.ts`: Redis sliding window limiter and Express middleware.
- `src/lib/crypto.ts`: AES-256-GCM encryption and decryption utilities.
- `src/db/`: PostgreSQL database schema, migrations, and repositories for credentials.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Exploration & Design | Perform deep dive scouting of database, rate limiting, and audit structures. | None | IN_PROGRESS |
| M1 | Multi-Tenant Audit Logging (R1) | Implement immutable hash-chain audit log store per tenant, query/export APIs, and trigger logging for trades, orders, and configs. | M0 | PLANNED |
| M2 | Redis Rate Limiter (R2) | Implement sliding window rate limiter in Redis Cluster, map pricing tiers, and mount middleware. | M0 | PLANNED |
| M3 | AES-256 Encryption at Rest (R3) | Design DB schema/migrations for exchange credentials, implement automatic AES-256-GCM encryption/decryption. | M0 | PLANNED |
| M4 | Integration & Verification | Run build/compile checks and vitest test suite, perform forensic audit. | M1, M2, M3 | PLANNED |

## Interface Contracts
### Audit Logs Query
- `GET /api/v1/audit/logs?tenantId=<tenantId>&eventType=<type>&startDate=<iso>&endDate=<iso>&limit=<limit>&skip=<skip>`
- Response:
  ```json
  {
    "logs": [
      {
        "id": "string",
        "tenantId": "string",
        "event": "string",
        "metadata": {},
        "ip": "string",
        "userAgent": "string",
        "hash": "string",
        "previousHash": "string",
        "createdAt": "string"
      }
    ],
    "total": number,
    "hasMore": boolean
  }
  ```

### Audit Logs Export
- `GET /api/v1/audit/export?tenantId=<tenantId>&format=<json|csv>&eventType=<type>&startDate=<iso>&endDate=<iso>`
- Response: file attachment (CSV or JSON format)

### Rate Limiter Tenant Tier Configurations
- **FREE**: 10 requests / minute
- **PRO**: 100 requests / minute
- **ENTERPRISE**: 1000 requests / minute
- Response on limit exceeded: HTTP 429 with JSON:
  ```json
  {
    "error": "Too many requests, please try again later"
  }
  ```

### Exchange Credentials Schema
- Columns to encrypt: `api_key`, `api_secret`, `passphrase`, `private_key`.
- Encryption Algorithm: AES-256-GCM.
