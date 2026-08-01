# Phase 3: Replace Direct appendTenantAuditLog in credentials-routes

**Agent:** fullstack-developer
**Depends on:** Phase 1

## Files to modify

| File | Change |
|------|--------|
| `src/platform/api/routes/credentials-routes.ts` | Replace direct `appendTenantAuditLog` calls with typed emitters |

## Context

This file is privacy-blocked (contains credentials schema). Use `bash cat` to read. It currently imports and calls `appendTenantAuditLog` directly for both `credentials.upsert` and `credentials.deleted` events, bypassing the emitter layer in audit-hooks.ts.

## Steps

1. Replace the import:
   ```
   // Remove:
   // import { appendTenantAuditLog } from '../../audit/tenant-audit-log';
   // Add:
   import {
     emitCredentialUpsertAuditEvent,
     emitCredentialDeletionAuditEvent,
   } from '../../audit/audit-hooks';
   ```

2. Replace the upsert audit call with:
   ```
   await emitCredentialUpsertAuditEvent({
     tenantId: subscriberId,
     actionBy: tokenSubscriberId,
     endpoint: '/api/v1/subscriber/credentials',
   });
   ```

3. Replace the deletion audit call with:
   ```
   await emitCredentialDeletionAuditEvent({
     tenantId: subscriberId,
     actionBy: tokenSubscriberId,
     endpoint: '/api/v1/subscriber/credentials',
   });
   ```

## Notes

- `tokenSubscriberId` is the actor (use as `actionBy`)
- `subscriberId` is the tenant (use as `tenantId`)
- No business logic change — audit wiring only
