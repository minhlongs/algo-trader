---
title: "R3: AES-256-GCM Encryption at Rest"
description: "Centralized EncryptionService singleton, envelope encryption, batch-migrate tenant_credentials"
status: complete
priority: P1
effort: 7h
branch: main
tags: [encryption, security, migration, envelope]
created: 2026-07-17
---

# Phase 03: R3 — AES-256-GCM Encryption at Rest

## Context
- Scout report: `reports/scout-report.md` §3, §4
- kongming advisory: centralized EncryptionService, envelope encryption, master key from env var, batch offline migration

## Requirements

### Functional
1. Centralized `EncryptionService` singleton in `src/seed/security/encryption-service.ts`
2. Envelope encryption: data key encrypts field values, master key encrypts data key
3. Master key from `ENCRYPTION_MASTER_KEY` env var (32 bytes hex, 64 chars)
4. Remove duplicate `src/lib/credentials-crypto.ts` (logic already in `src/seed/security/crypto.ts`)
5. Batch-migrate existing plaintext in `tenant_credentials` to encrypted
6. All writes to sensitive columns go through `EncryptionService`

### Fields to Encrypt
| Table | Column | Current State |
|-------|--------|---------------|
| `tenant_credentials` | `api_key` | Plaintext |
| `tenant_credentials` | `api_secret` | Plaintext |
| `tenant_credentials` | `passphrase` | Plaintext |
| `tenant_credentials` | `private_key` | Plaintext |

### Non-Functional
- Encrypt-on-write, decrypt-on-read (transparent to callers)
- Envelope key re-wrapping without data re-encryption (rotation support)
- Batch migration: 100 rows per transaction, checksum validation
- 0 `:any`, 0 `console.log`, 0 TypeScript errors

## Architecture

```
                    ┌─────────────────────┐
                    │  ENCRYPTION_MASTER_KEY │  (env var, 32 bytes)
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   DataKey (32 bytes) │  — encrypted by master key
                    │   (rotatable)        │
                    └──────────┬──────────┘
                               │
          ┌────────────┬────────┴────────┬────────────┐
          │            │                 │            │
     encrypt()    decrypt()       rewrapKey()    rotateKey()
          │            │                 │            │
          └────────────┴─────────────────┴────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  tenant_credentials │  api_key, api_secret,
                    │  (ciphertext stored│  passphrase, private_key
                    │   as base64)        │  → {ciphertext, iv, tag}
                    └─────────────────────┘
```

## Files to Modify

| File | Change |
|------|--------|
| `src/seed/security/encryption-service.ts` | **CREATE** — singleton with envelope encryption |
| `src/seed/security/crypto.ts` | Add `rewrapDataKey`, `rotateMasterKey`; rename env var to `ENCRYPTION_MASTER_KEY` (backward compat alias for `CREDENTIALS_ENCRYPTION_KEY`) |
| `src/seed/security/types.ts` | Add `EncryptionService` types: `EncryptedPayload`, `EnvelopeKey` |
| `src/platform/db/tenant-credentials-repository.ts` | Use `EncryptionService` for all encrypt/decrypt calls (privacy-blocked, see scout) |
| `src/lib/credentials-crypto.ts` | **DELETE** — superseded by `seed/security/crypto.ts` |
| `.env.example` | Update env var name, add `ENCRYPTION_MASTER_KEY` |

## Files to Create

| File | Purpose |
|------|---------|
| `src/seed/security/encryption-service.ts` | Singleton: encrypt(), decrypt(), rotateKey(), rewrapDataKey() |
| `scripts/migrate-encrypt-credentials.ts` | Batch migration: plaintext → encrypted in tenant_credentials |

## Files to Delete

| File | Reason |
|------|--------|
| `src/lib/credentials-crypto.ts` | Duplicate of `seed/security/crypto.ts`; callers should use the canonical path |

## Implementation Steps

### Step 1: Create EncryptionService singleton
- File: `src/seed/security/encryption-service.ts` (new)
- Singleton pattern: `static getInstance()`
- Internals:
  - `_dataKey: Buffer` — loaded from Redis cache or unwrapped from DB
  - `_masterKey: Buffer` — from `ENCRYPTION_MASTER_KEY` env var
  - `_keyVersion: number` — tracks key rotation generation
- Methods:
  - `encrypt(plaintext: string): EncryptedPayload` — AES-256-GCM, returns `{ciphertext, iv, tag}`
  - `decrypt(payload: EncryptedPayload): string`
  - `rewrapDataKey(newMasterKey: Buffer): void` — re-encrypt data key with new master
  - `rotateMasterKey(): Promise<void>` — generate new data key, rewrap, update cache
- Error handling: throw on missing env var, invalid payload
- Uses `seed/security/crypto.ts` for low-level encrypt/decrypt

### Step 2: Extend crypto.ts with key rotation
- File: `src/seed/security/crypto.ts`
- Add env var alias: read `ENCRYPTION_MASTER_KEY` first, fallback to `CREDENTIALS_ENCRYPTION_KEY` (backward compat during migration)
- Add `rewrapKey(encryptedDataKey, oldMasterKey, newMasterKey)` — decrypt data key with old, encrypt with new
- Add `sealDataKey(dataKey, masterKey)` — encrypt data key buffer with master key (envelope)

### Step 3: Add types
- File: `src/seed/security/types.ts`
```ts
export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string;         // base64
  tag: string;        // base64
}

export interface EnvelopeKey {
  encryptedDataKey: string; // base64
  keyVersion: number;
  algorithm: 'aes-256-gcm';
}
```

### Step 4: Update tenant-credentials-repository.ts
- File: `src/platform/db/tenant-credentials-repository.ts` (privacy-blocked)
- Import `EncryptionService` from `@/seed/security/encryption-service`
- Replace direct `encrypt()`/`decrypt()` calls with `EncryptionService.getInstance().encrypt/decrypt`
- INSERT/UPDATE: encrypt each sensitive column before write
- SELECT: decrypt after read
- Remove local `decrypt` function (moved to EncryptionService)

### Step 5: Write batch migration script
- File: `scripts/migrate-encrypt-credentials.ts` (new)
- Read all rows from `tenant_credentials` where `api_key` is NOT null AND NOT already encrypted
- Heuristic for "already encrypted": check if value starts with base64 pattern of known encrypted format, OR check length (encrypted is longer than typical API key)
- Better: add `encryption_version` column check, or detect if column contains `:` delimiters (old format from credentials-crypto.ts)
- Process: 100 rows per transaction, encrypt, checksum compare, log progress
- Dry-run mode: `--dry-run` flag to preview without writing
- Usage: `npx tsx scripts/migrate-encrypt-credentials.ts --dry-run`

### Step 6: Remove duplicate credentials-crypto.ts
- Delete: `src/lib/credentials-crypto.ts`
- Verify: `grep -rn 'credentials-crypto' src/` → only test file mentions it
- Update or delete: `src/lib/credentials.test.ts` (if it imports deleted file)

### Step 7: Update env var references
- File: `.env.example`
- Add `ENCRYPTION_MASTER_KEY=your-64-char-hex-string-for-envelope-encryption`
- Keep `CREDENTIALS_ENCRYPTION_KEY` commented as deprecated (backward compat alias)
- Update any docs referencing the old name

### Step 8: Prisma $use middleware (optional, deferred to follow-up)
- Not required for initial rollout — EncryptionService used directly in repository layer
- Prisma middleware deferred: adds complexity without immediate benefit

## Todo List
- [ ] Create EncryptionService singleton (encrypt/decrypt/rotate/rewrap)
- [ ] Add envelope key support to crypto.ts
- [ ] Add EncryptedPayload + EnvelopeKey types
- [ ] Update tenant-credentials-repository.ts
- [ ] Write batch migration script
- [ ] Remove credentials-crypto.ts
- [ ] Update .env.example
- [ ] Run migration dry-run → verify all rows encrypted
- [ ] Run migration live → verify decryption works
- [ ] Run `npx tsc --noEmit` → 0 errors
- [ ] Run `npm test` → all pass

## Success Criteria
1. `EncryptionService.getInstance().encrypt('test')` returns `{ciphertext, iv, tag}`
2. `EncryptionService.getInstance().decrypt(payload)` returns original plaintext
3. `tenant_credentials` rows are encrypted in DB (unreadable plaintext)
4. API credentials routes still work (transparent decrypt-on-read)
5. `grep -rn 'credentials-crypto' src/` → 0 match (after deletion)
6. `grep -rn ':any' src/seed/security/encryption-service.ts` → 0 match
7. `grep -rn 'console\.\(log\|warn\|error\)' src/seed/security/` → 0 match
8. `.env.example` documents `ENCRYPTION_MASTER_KEY`

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration corrupts credentials | Medium | Critical | Dry-run first, checksum per batch, backup before run |
| Wrong key on deploy | Medium | Critical | Gate: verify decrypt works in staging before prod |
| Envelope rewrap loses data | Low | High | Rewrap is non-destructive (encrypt-with-new only) |
| credentials-crypto.ts still imported | Low | Medium | grep all imports before deletion |

## Security Considerations
- Master key: 32 bytes from env var, never logged, never in git
- Data key: cached in memory, re-wrappable without data re-encryption
- IV: 12 bytes random per encrypt (NIST SP 800-38D)
- Auth tag: 16 bytes (AES-GCM integrity)
- All ciphertext: base64-encoded for TEXT columns
- Batch migration: run during maintenance window, verify checksums

## Rollback
- Migration script re-encrypts — if failure mid-batch, re-run (idempotent: already-encrypted rows skipped)
- Revert code changes: `git revert` the EncryptionService commit
- Master key rotation: `revertMasterKey()` restores previous key from backup env var
- Rollback tier: L2 (data integrity at risk, requires manual verification)
