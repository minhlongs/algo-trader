# Phase 1: Add emitCredentialUpsertAuditEvent

**Agent:** fullstack-developer
**Depends on:** (none — can be done in parallel with Phase 4)

## Files to modify

| File | Change |
|------|--------|
| `src/platform/audit/audit-event-types.ts` | Confirm `'credentials.upsert'` is in union (already present line 9) |
| `src/platform/audit/audit-hooks.ts` | Add `CredentialUpsertAuditMetadata` interface + `emitCredentialUpsertAuditEvent` function |
| `src/platform/audit/__tests__/audit-hooks.test.ts` | Add test cases for new emitter; update import |

## Steps

1. In `audit-hooks.ts`, after `CredentialDeletionAuditMetadata` (line 29), add:
   ```ts
   export interface CredentialUpsertAuditMetadata {
     tenantId: string;
     actionBy: string;
     endpoint: string;
   }
   ```
2. After `emitCredentialDeletionAuditEvent` (line 45), add:
   ```ts
   export async function emitCredentialUpsertAuditEvent(
     params: CredentialUpsertAuditMetadata,
   ): Promise<void> {
     await appendTenantAuditLog(
       params.tenantId,
       'credentials.upsert',
       params.actionBy,
       `Credentials set via ${params.endpoint}`,
       { endpoint: params.endpoint },
     );
   }
   ```
3. Export the new function from `audit-hooks.ts` (it's top-level, auto-exported).
4. In `audit-hooks.test.ts`, add `emitCredentialUpsertAuditEvent` to the import line (line 8-13) and add a test block:
   ```ts
   describe('emitCredentialUpsertAuditEvent', () => {
     it('emits credentials.upsert', async () => {
       await expect(
         emitCredentialUpsertAuditEvent({
           tenantId: 't-1',
           actionBy: 'subscriber',
           endpoint: '/api/v1/subscriber/credentials',
         }),
       ).resolves.toBeUndefined();
       expect(mockedAppend).toHaveBeenCalledTimes(1);
       const [, eventType, actionBy] = mockedAppend.mock.calls[0] as [
         string, string, string,
       ];
       expect(eventType).toBe('credentials.upsert');
       expect(actionBy).toBe('subscriber');
     });
   });
   ```
5. Run `npx vitest run src/platform/audit/__tests__/audit-hooks.test.ts` — must pass 6/6.

## Acceptance

- New test passes (6 total tests: 1 rate limit, 1 credential deletion, 1 credential upsert, 2 trade, 1 config)
- No TypeScript errors in `audit-hooks.ts`
