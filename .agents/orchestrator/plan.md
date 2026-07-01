# Plan — Compliance & Security Hardening Framework (Phase 35)

We will use the Project Pattern to implement the Compliance & Security Hardening Framework. The work is decomposed into milestones covering R1 (Multi-Tenant Audit Logging), R2 (Redis-Based Distributed Rate Limiter), and R3 (AES-256 Encryption at Rest), followed by verification and security auditing.

## Strategy & Workflow
1. **Decomposition & Setup**: Establish the plan, progress, and context files.
2. **Exploration**: Spawn Explorer agents to inspect existing database schemas, tenant middleware, Redis connection configurations, and encryption/decryption patterns.
3. **Implementation**:
   - **Milestone 1 (R1 - Multi-Tenant Audit Logging)**: Build tenant-isolated immutable audit logs (incorporating IP, user agent, timestamp, action, and tenantId). Expose fast query/export APIs. Integrate into trades, orders, and configuration updates.
   - **Milestone 2 (R2 - Redis-Based Distributed Rate Limiter)**: Create a sliding window rate limiter in Redis Cluster (ports 7000-7005). Adapt limits based on pricing tiers (FREE, PRO, ENTERPRISE). Replace existing express-rate-limit.
   - **Milestone 3 (R3 - AES-256 Encryption at Rest)**: Implement AES-256-GCM encryption for API keys, secrets, and exchange credentials before writing to DB, and decrypt them on the fly at runtime.
4. **Verification**: Compile with TypeScript (no `any`/`ts-ignore`) and run all 1500+ backend and 35+ frontend tests to ensure 100% PASS.
5. **Auditing**: Perform forensic integrity audits to verify strict tenant isolation and secure storage.

## Target Files (Preliminary)
- `src/audit/` (Audit logging logic and store)
- `src/api/routes/audit-routes.ts` (Audit query and export APIs)
- `src/resilience/rate-limiter.ts` (Redis sliding window limiter)
- `src/api/server.ts` (Middleware mounting and configuration)
- `src/db/` (Migrations and repositories for key encryption)
- `src/lib/crypto.ts` (AES-256-GCM utilities)
