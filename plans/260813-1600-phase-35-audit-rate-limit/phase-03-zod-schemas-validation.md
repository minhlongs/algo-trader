# Phase 03: Zod Schemas for Audit Entry Validation

## Context Links
- Audit entry type: `src/seed/security/types.ts:9-28` (IAuditEntry interface)
- Audit log writer: `src/seed/security/audit-log.ts:251-286` (logAudit function)
- Zod patterns: `src/platform/api/schemas/referral.schemas.ts` (pagination pattern)
- Zod import: `zod` v4.3.6 in package.json

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Add Zod schema to validate `IAuditEntry` objects before database insertion. Ensures all required fields present, correct types, non-empty strings, valid ISO timestamps, and metadata size constraint (max 4kB).

## Key Insights
1. `logAudit()` currently validates with manual `if` checks — Zod replaces these with declarative schema
2. Zod v4 is installed — use `z.object()` pattern consistent with `src/platform/api/schemas/`
3. Validation must happen BEFORE hash chain computation — invalid entries should never enter chain
4. Schema is internal (not API-facing) — no need for `safeParse` error formatting for end users

## Requirements
### Functional
- Zod schema validates all fields of `IAuditEntry`:
  - `id`: non-empty string (ULID preferred, but accept any string)
  - `timestamp`: ISO-8601 datetime string
  - `actor`: non-empty string
  - `action`: non-empty string (e.g., `api_keys.create`)
  - `resource`: non-empty string (e.g., `Strategy:42`)
  - `result`: enum `['success', 'failure', 'denied']`
  - `metadata`: `Record<string, unknown>` with JSON.stringify size <= 4096 bytes
  - `ipHash`: non-empty string
  - `tenantId`: optional non-empty string
- Validation failure throws `ZodError` with descriptive message

### Non-Functional
- Schema file under 200 lines
- No runtime performance impact on valid entries (Zod parse is fast)
- Compatible with existing `IAuditEntry` type (schema IS the runtime type)

## Architecture

### Integration Point
```
logAudit(entry: IAuditEntry)
  -> auditEntrySchema.parse(entry)  // NEW: Zod validation
  -> compute hash chain
  -> INSERT into audit_log
```

### File Location
```
src/seed/security/schemas/
  audit-entry-schema.ts     # Zod schema + inferred type
```

Placed in `schemas/` subdirectory to follow platform pattern (`src/platform/api/schemas/`).

## Related Code Files
### Files to create
- `src/seed/security/schemas/audit-entry-schema.ts`

### Files to modify
- `src/seed/security/audit-log.ts:251-286` — add `auditEntrySchema.parse(entry)` before manual validation
- `src/seed/security/audit-log.ts:1` — import schema

### Files to verify
- `src/seed/security/types.ts` — IAuditEntry (unchanged, schema validates against it)
- `src/seed/security/__tests__/audit-log.test.ts` — existing tests must pass

## Implementation Steps
1. **Create Zod schema file**
   - File: `src/seed/security/schemas/audit-entry-schema.ts`
   - Define `auditEntrySchema` with all IAuditEntry fields
   - Export inferred type: `export type AuditEntryInput = z.infer<typeof auditEntrySchema>`
   - Metadata size check: custom validator on `.refine()`

2. **Wire schema into `logAudit()`**
   - File: `src/seed/security/audit-log.ts`
   - Add: `import { auditEntrySchema } from './schemas/audit-entry-schema';`
   - At start of `logAudit()`: `auditEntrySchema.parse(entry)`
   - Remove manual validation checks that Zod now covers

3. **Verify backward compatibility**
   - Run existing 28 audit-log tests — must pass
   - Verify all existing `logAudit()` call sites produce valid entries

## Todo List
- [ ] Create `src/seed/security/schemas/audit-entry-schema.ts`
- [ ] Define `auditEntrySchema` matching `IAuditEntry` fields
- [ ] Add metadata size constraint (max 4kB via `.refine()`)
- [ ] Import schema into `audit-log.ts`
- [ ] Add `auditEntrySchema.parse(entry)` to `logAudit()`
- [ ] Remove redundant manual validation
- [ ] Run `npx tsc --noEmit` — 0 errors
- [ ] Run audit tests — all 28 pass
- [ ] Run full test suite — no regressions

## Success Criteria
- [ ] Zod schema validates all IAuditEntry fields
- [ ] `logAudit()` rejects invalid entries with descriptive ZodError
- [ ] Valid entries pass through unchanged
- [ ] All existing audit tests pass
- [ ] Schema file under 200 lines
- [ ] Zero `:any` types
- [ ] Zero TypeScript errors

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Zod parse adds latency to audit writes | Low | Low | Zod parse is <1ms for small objects; audit is async anyway |
| Existing call sites pass unexpected types | Low | Medium | Run existing 28 tests first; fix any failures before proceeding |
| Metadata size check rejects valid entries | Low | Low | 4kB limit is generous; most metadata < 1kB |

## Security Considerations
- Schema prevents injection of malformed audit entries
- Metadata size limit prevents memory exhaustion from oversized payloads
- `tenantId` validation prevents cross-tenant audit pollution

## Next Steps
- Phase 04: E2E integration test (depends on Phase 01 + 02 + 03)
