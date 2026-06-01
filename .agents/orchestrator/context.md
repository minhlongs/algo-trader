# Context — Environmental Setup (Phase 35)

## Application Setup
- **REST/WebSocket Port**: 3000
- **Dashboard Port**: 5173
- **TypeScript Strictness**: No use of `any` or `@ts-ignore` in new code.
- **Verification Command**: `npx tsc --noEmit` (at root and `dashboard`)

## Database & Caching
- **PostgreSQL**: Local database `algo_trader`
- **Redis Cluster**: Ports 7000 to 7005 on `127.0.0.1`

## Acceptance Criteria
- **R1**: Immutable audit logs containing IP, user agent, timestamp, action, and tenantId. Complete isolation per tenant.
- **R2**: Sliding window rate limiter in Redis Cluster rejecting requests exceeding tenant tier limit (FREE, PRO, ENTERPRISE) with HTTP 429.
- **R3**: AES-256-GCM encryption for API keys, secrets, and exchange credentials stored in PostgreSQL, decrypted on demand.
- **Tests**: 100% PASS for all existing and new tests.
- **Audit**: Clean status from Forensic Auditor.
