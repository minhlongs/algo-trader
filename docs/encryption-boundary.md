# Encryption Boundary

## Encrypted Fields

| Column | Description |
|--------|-------------|
| `api_key` | Exchange API key |
| `api_secret` | Exchange API secret |
| `passphrase` | Trading passphrase |
| `private_key` | Private key material |

## Algorithm

- **Algorithm:** AES-256-GCM (`aics`).
- **Key length:** 32 bytes (256 bits).
- **IV:** 12 bytes random per call.
- **Auth tag:** 16 bytes.
- **Encoding:** base64 for ciphertext, iv, tag.

## IV / Tag Storage

`encryptString` returns `ciphertext:iv:tag` (colon-delimited). The full packed string is stored in the `api_key`, `api_secret`, `passphrase`, and `private_key` columns. No separate key table.

## Key Storage

- Primary: `ENCRYPTION_MASTER_KEY`.
- Fallback: `CREDENTIALS_ENCRYPTION_KEY`.
- Key derived via `envKey()` in `crypto.ts`.
- Key rotation is out of scope for this plan.

## Boundary

Implements: `src/platform/db/tenant-credentials-repository.ts`.
