# Encryption Boundary

## Scope

All tenant credential fields stored by `tenant_credentials_repository.ts` are encrypted at rest using AES-256-GCM.

## Encrypted Fields

| Column | Plaintext Example |
|--------|------------------|
| `api_key` | Exchange API key |
| `api_secret` | Exchange API secret |
| `passphrase` | Trading passphrase |
| `private_key` | Private key material |

Plaintext never appears in SQL dumps or backups.

## Algorithm

- Algorithm: AES-256-GCM (`aes-256-gcm`)
- Key length: 32 bytes
- IV: 12 bytes (random per encryption)
- Auth tag: 16 bytes
- Encoding: base64 for ciphertext, IV, and tag

## Key Storage

Primary env var: `ENCRYPTION_MASTER_KEY` (fallback: `CREDENTIALS_ENCRYPTION_KEY`)

Value must be 64 hex characters (32 bytes). Rotation requires writing new key, re-encrypting all rows, then retiring old key.

## IV / Tag Storage

IV and auth tag are stored alongside the ciphertext in the same column. No separate key table; IV is never reused because it is randomly generated per encryption operation.

## Key Rotation Policy

Rotation is a manual, out-of-band process. No automated rotation is implemented in this phase. Rotation runbook to be created separately.

## References

- Implementation: `src/seed/security/crypto.ts` (`encrypt`, `decrypt`, `encryptString`, `decryptString`)
- Consumer: `src/platform/db/tenant-credentials-repository.ts`
- Migration: `src/shared/db/migrations/021-tenant-audit.ts`
