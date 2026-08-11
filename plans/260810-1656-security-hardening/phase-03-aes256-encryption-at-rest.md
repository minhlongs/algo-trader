# Phase 03: AES-256 Encryption at Rest

## Context Links
- Existing crypto: `src/seed/security/crypto.ts:1` (AES-256-GCM implementation)
- Existing repo: `src/db/tenant-credentials-repository.ts:1` (already uses `encryptString`/`decryptString`)
- Migrations: `src/db/migrations/021_tenant_credentials.sql`, `029_tenant_credentials.sql`
- Tests: `src/seed/security/__tests__/crypto.test.ts`

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Ensure all sensitive tenant credentials (API keys, secrets, passphrases, private keys) are encrypted at rest using AES-256-GCM. Verify existing implementation is complete and add migration for any unencrypted columns.

## Key Insights from Code Review
1. `src/seed/security/crypto.ts` already implements AES-256-GCM with `encryptString`/`decryptString`
2. `src/db/tenant-credentials-repository.ts` already uses these functions for all credential fields
3. Two migration versions exist for `tenant_credentials` table:
   - 021: Uses `_encrypted` suffix columns (api_key_encrypted, etc.)
   - 029: Uses plain columns (api_key, api_secret, etc.) — appears older
4. Current table schema needs verification — which migration actually applied?
5. Key derivation: `envKey()` uses `CREDENTIALS_ENCRYPTION_KEY` or `ENCRYPTION_MASTER_KEY` env var → PBKDF2 → 32-byte key

## Requirements

### Functional
- All credential fields encrypted at rest: `api_key`, `api_secret`, `passphrase`, `private_key`
- Encryption: AES-256-GCM with 96-bit IV, 128-bit auth tag (NIST SP 800-38D compliant)
- Key derivation: PBKDF2-SHA256, **600k iterations**, per-field context separation
- Decryption only at runtime when credentials needed for exchange API calls
- Automatic re-encryption on credential update (rotate IV each write)
- **Version-prefixed payload and per-tenant envelope encryption (DEK)** for zero-downtime key rotation
- Separate derivation context for each field and tenant (no key reuse across purposes)

### Non-Functional
- Zero plaintext credentials in database (verify via migration)
- Fail-closed on decryption failure (throw typed error, never return partial data)
- Key rotation strategy: support multiple key versions (`key_id` in encrypted payload)
- <1ms encryption/decryption overhead per field after DEK cache warmup

## Architecture

### Data Flow
```
Save Credentials:
  TenantCredentialsRepository.save(subscriberId, creds)
    → resolve tenant DEK using current master key version
    → encryptWithDek(creds.apiKey, tenantId + ':apiKey') → "v2:dek-id:ciphertext:iv:tag"
    → INSERT/UPDATE tenant_credentials SET api_key_encrypted = ?

Load Credentials:
  TenantCredentialsRepository.get(subscriberId)
    → SELECT *_encrypted, encryption_version
    → resolve DEK from key version + tenant id
    → decryptWithDek(row.api_key_encrypted)
    → return { apiKey, apiSecret, ... }
```

### Encrypted Payload Format
```
v{master_key_version}:d{dek_version}:ciphertext_hex:iv_hex:tag_hex
```

### Key Management
- Master key from env/KMS: `CREDENTIALS_ENCRYPTION_KEY_V1`, `CREDENTIALS_ENCRYPTION_KEY_V2`
- Derive per-tenant DEK with HKDF-SHA256 using tenant ID as salt/context
- Current version selected by `CREDENTIALS_ENCRYPTION_CURRENT_VERSION`
- Keep previous key versions available until all rows are re-encrypted
- Never log key IDs together with tenant credentials or plaintext values

## Related Code Files

### Verify/Modify
1. `src/db/tenant-credentials-repository.ts` — Confirm all 4 fields use tenant-scoped encrypt/decrypt and typed error handling
2. `src/seed/security/crypto.ts` — Add version parsing, HKDF/DEK derivation, generic decryption errors, startup key validation
3. `src/db/migrations/042-credentials-encryption.ts` — New defensive migration after production schema inspection

### Create
4. `src/seed/security/key-rotation.ts` — Versioned master-key + per-tenant DEK utilities and re-encryption job
5. `src/db/migrations/042-credentials-encryption.ts` — Migration for encrypted-only columns, constraints, and version metadata

### Verify Schema
6. Inspect production schema first using `information_schema.columns`; do not assume migration 021 or 029.

## Implementation Steps

1. **Inspect production DB schema first**: run a read-only `information_schema.columns` query for `tenant_credentials`; record actual schema and row counts before writing migration 042.
2. **Create defensive migration 042**:
   - Detect existing columns and never overwrite plaintext in place.
   - Add `*_encrypted` columns and `encryption_version` if missing.
   - If plaintext columns contain rows, encrypt them in a transaction with the current key, verify decryptability, then remove plaintext columns only after verification.
   - Add constraints preventing future writes to plaintext columns.
3. **Update crypto implementation**:
   - Confirm AES-256-GCM with 12-byte IV, 16-byte tag.
   - Add HKDF-SHA256 tenant DEK derivation with field context.
   - Add version-prefixed payload parsing and current/previous key lookup.
   - Use 600k PBKDF2 iterations where passwords remain applicable; credentials use HKDF-derived DEKs.
   - Return generic `Error('decryption failed')` without internal crypto details.
4. **Verify repository**: All 4 fields (apiKey, apiSecret, passphrase, privateKey) encrypted/decrypted with tenant context; catch and classify typed decrypt failures without returning partial credentials.
5. **Add key rotation support**:
   - `key-rotation.ts` scans rows in batches, decrypts with old version, encrypts with current version, verifies round trip, and commits each batch.
   - Preserve old keys until migration completion and an audited verification pass.
6. **Startup/readiness validation**: Fail fast when current encryption key is missing or malformed; readiness endpoint reports key version without exposing secrets.
7. **Write tests**:
   - Round-trip encrypt/decrypt for all fields and tenants
   - Cross-tenant DEK isolation
   - Decrypt failure throws generic typed error
   - Version handling and rotation with old key retained
   - Migration plaintext-to-encrypted path and rollback safety

## Todo List
- [ ] Inspect production tenant_credentials schema and row counts (read-only)
- [ ] Create defensive migration 042-credentials-encryption.ts
- [ ] Implement tenant-scoped HKDF DEK and versioned payload format
- [ ] Validate AES-256-GCM parameters and generic errors
- [ ] Verify repository encrypts all 4 fields
- [ ] Add startup/readiness key validation
- [ ] Implement batch key rotation utility
- [ ] Write unit and migration tests

## Success Criteria
- `tenant_credentials` table has ONLY encrypted columns (`*_encrypted`)
- No plaintext credentials in database (verified by SELECT)
- `encryptString`/`decryptString` round-trip works for all field types and tenants
- Decryption throws on tampered ciphertext, wrong key, corrupted data without leaking details
- Key rotation works without downtime and old rows remain readable until migrated
- Migration 042 applies cleanly to the inspected production schema
- All existing tests pass + new encryption tests pass

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wrong migration applied (029 vs 021) | Medium | High | Inspect production schema first; defensive additive migration |
| Master key not set in production | Low | Critical | Fail-fast at startup/readiness |
| Key rotation breaks existing data | Medium | High | Version prefix, dual-key read, batch verify before retiring old key |
| Per-tenant DEK derivation mismatch | Medium | High | Golden vectors and cross-tenant tests |
| Performance overhead | Low | Medium | HKDF + cached DEK, batch operations |

## Security Considerations
- Master keys never logged, never in source control
- Dedicated encryption keys separate from audit HMAC keys
- IV unique per encryption (`crypto.randomBytes(12)`)
- Auth tag prevents tampering
- HKDF context binds tenant and field
- Encrypted columns only — no plaintext fallback
