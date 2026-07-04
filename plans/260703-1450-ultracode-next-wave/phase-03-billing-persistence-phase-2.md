---
phase: 3
title: "Billing Persistence Phase 2"
status: pending
effort: L
---

# Phase 3: Billing Persistence Phase 2

## Overview
Migrate remaining 6 in-memory Map services to PostgreSQL. Follows established pattern from 043-045.

## Current State
- 3 services already migrated (subscriptions, payments, licenses)
- 37 migrations total (043-045 are billing)
- 6 remaining in-memory Maps

## Services to Migrate

| # | Migration | Table | Service | Current Storage | Risk |
|---|-----------|-------|---------|----------------|------|
| 1 | 046 | coupon_service | coupon-service.ts | JSON file | Low (persists but no ACID) |
| 2 | 047 | trial_drip_subscribers | trial-drip-service.ts | Map | Medium (state lost on restart) |
| 3 | 048 | enterprise_inquiries | enterprise-inquiry-store.ts | Map | Low (manual sales workflow) |
| 4 | 049 | api_keys | api-key-manager.ts | Map | HIGH (security: scrypt keys) |
| 5 | 050 | onboarding_pending | onboarding-service.ts | Map | Low (intentionally ephemeral) |
| 6 | 051 | usage_metering_thresholds | usage-metering.ts | Map | Low (cached thresholds) |

## Implementation Pattern
1. Create migration file (NNA-add-table-name.ts) following 042 precedent
2. Register in migration-runner.ts
3. Refactor service: remove Map, add rowToType mapper, use query() for CRUD
4. Update callers if return types changed (sync→async)
5. Update tests to mock postgres-client query
6. `npx tsc --noEmit` + `npx vitest run`

## Related Files
- Create: `src/shared/db/migrations/046-051-*.ts`
- Modify: `src/shared/db/migration-runner.ts`
- Modify: `src/platform/billing/*-service.ts` (6 files)
- Modify: Caller files and test files

## Success Criteria
- [ ] 6 migrations created + registered
- [ ] 6 services refactored from in-memory Maps to PostgreSQL
- [ ] All tests pass
- [ ] TypeScript: 0 errors
