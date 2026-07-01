# Analysis Report — R3: AES-256 Encryption at Rest

## Executive Summary
This report investigates the requirement to secure sensitive credentials stored at rest (API keys, secrets, passphrases, and Polymarket private keys) within the PostgreSQL database using **AES-256-GCM**. 

Our investigation confirms:
1. **No existing credentials table:** All exchange credentials in the current codebase are managed exclusively via environment variables (`POLY_API_KEY`, `POLY_API_SECRET`, `POLY_PASSPHRASE`, `POLY_PRIVATE_KEY` / `POLYMARKET_PRIVATE_KEY` etc.). There are no credentials currently persisted in the PostgreSQL database.
2. **Plaintext Flat Files:** The license key system currently records licenses in plaintext inside `data/licenses.json`. The existing `encryptLicenseKey`/`decryptLicenseKey` functions in `src/lib/license-key-crypto.ts` are unused (dead code).
3. **Transition to GCM:** Upgrading the cryptographic utilities from `AES-256-CBC` to `AES-256-GCM` will require altering the stored output format to include the GCM **Authentication Tag**. GCM's integrity verification guarantees tamper-proof stored credentials.

---

## 1. Existing Architecture & Findings

### Database Schema
* The database schema (`src/db/schema.sql`) and all applied migrations under `src/db/migrations/` contain only P&L (`trades`, `pnl_daily`, `performance_metrics`), session auth (`user`, `session`, `account`, `verification`), signal logs (`signals`, `signal_subscriptions`, `signal_delivery_log`), and task queues.
* There is no existing multi-tenant credentials store in Postgres. 

### License Key Cryptography
* `src/lib/license-key-crypto.ts` contains `encryptLicenseKey` and `decryptLicenseKey` functions implemented using `AES-256-CBC`.
* It relies on `process.env.LICENSE_ENCRYPTION_KEY` which must be a 32-byte key.
* The CBC implementation concatenates the 16-byte random IV and ciphertext separated by a colon: `iv_hex:ciphertext_hex`.
* However, this file's encryption is dead code; the live `LicenseService` (`src/billing/license-service.ts`) generates and writes plaintext license keys to `data/licenses.json`. Therefore, changing the encryption format will not break any existing data.

### Exchange Connection
* Strategies and adapters (`src/polymarket/clob-client.ts` and `src/polymarket/clob-v2-adapter.ts`) rely strictly on process-wide environment variables for API execution and order signing. 
* To support multi-tenancy (BYOK), the system needs to fetch and decrypt these credentials per-tenant from Postgres before order submission.

---

## 2. Transitioning to AES-256-GCM
AES-256-CBC does not guarantee integrity (ciphertext can be manipulated in place). AES-256-GCM provides **Authenticated Encryption with Associated Data (AEAD)**, which produces an **Authentication Tag**. If the ciphertext or IV is tampered with, decryption will fail.

### Refactoring `src/lib/license-key-crypto.ts`
We will replace the existing CBC implementation with GCM:
* Standard IV size for GCM is **12 bytes** (compared to 16 bytes for CBC).
* Output format: `iv_hex:tag_hex:ciphertext_hex` (3 parts).

```typescript
// Proposed refactored functions in src/lib/license-key-crypto.ts:

/** Encrypt license key for secure storage (AES-256-GCM) */
export function encryptLicenseKey(key: string): string {
  const encKey = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard GCM IV is 12 bytes
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/** Decrypt license key from storage */
export function decryptLicenseKey(encrypted: string): string {
  const encKey = getEncryptionKey();
  const parts = encrypted.split(':');
  
  // Backward compatibility check
  if (parts.length === 2) {
    // If we ever need to decrypt legacy CBC data:
    const iv = Buffer.from(parts[0]!, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', encKey, iv);
    let decrypted = decipher.update(parts[1]!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted license key format (must be IV:TAG:CIPHERTEXT)');
  }
  
  const iv = Buffer.from(parts[0]!, 'hex');
  const tag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = parts[2]!;
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

---

## 3. Database Schema Proposal
To support multi-tenant credential storage, we propose a new migration file: `src/db/migrations/021_tenant_credentials.sql`.

```sql
-- Migration 021: Tenant Credentials table for BYOK
-- Creates tenant_credentials table storing encrypted API keys, secrets, passphrases, and private keys.

CREATE TABLE IF NOT EXISTS tenant_credentials (
  subscriber_id TEXT PRIMARY KEY, -- references tenant identifier (or user ID)
  api_key TEXT NOT NULL,          -- encrypted format 'iv:tag:ciphertext'
  api_secret TEXT NOT NULL,       -- encrypted format 'iv:tag:ciphertext'
  passphrase TEXT NOT NULL,       -- encrypted format 'iv:tag:ciphertext'
  private_key TEXT NOT NULL,      -- encrypted format 'iv:tag:ciphertext'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for subscriber query speed
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_subscriber ON tenant_credentials(subscriber_id);
```

To register this migration, add it to `MIGRATIONS` in `src/db/migration-runner.ts`:
```typescript
// Add to MIGRATIONS array in src/db/migration-runner.ts
createSqlMigration('021_tenant_credentials.sql', '021_tenant_credentials', 'Tenant Credentials table for BYOK'),
```
And add down-migration logic to standard runner drop routines.

---

## 4. Cryptography & Repository Implementation

### Generic GCM Crypto Utility (`src/lib/credentials-crypto.ts`)
A dedicated encryption service for credentials that relies on a distinct `CREDENTIALS_ENCRYPTION_KEY` environment variable.

```typescript
import crypto from 'crypto';

const KEY = process.env.CREDENTIALS_ENCRYPTION_KEY;

function getEncryptionKey(): Buffer {
  if (!KEY) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set.');
  // Must be a 32-byte hex key or standard string
  const buf = Buffer.from(KEY, 'utf-8');
  if (buf.length !== 32) {
    throw new Error(`CREDENTIALS_ENCRYPTION_KEY must be exactly 32 bytes (current: ${buf.length}).`);
  }
  return buf;
}

export function encrypt(text: string): string {
  const encKey = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const encKey = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted payload');
  
  const iv = Buffer.from(parts[0]!, 'hex');
  const tag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = parts[2]!;
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### Credentials Repository (`src/db/tenant-credentials-repository.ts`)
Manages database interaction with transparent encryption on write and decryption on read.

```typescript
import { query } from './postgres-client';
import { encrypt, decrypt } from '../lib/credentials-crypto';

export interface DecryptedCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  privateKey: string;
}

export class TenantCredentialsRepository {
  async save(subscriberId: string, creds: DecryptedCredentials): Promise<void> {
    const encApiKey = encrypt(creds.apiKey);
    const encApiSecret = encrypt(creds.apiSecret);
    const encPassphrase = encrypt(creds.passphrase);
    const encPrivateKey = encrypt(creds.privateKey);
    const now = new Date();

    const sql = `
      INSERT INTO tenant_credentials (
        subscriber_id, api_key, api_secret, passphrase, private_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (subscriber_id) DO UPDATE SET
        api_key = EXCLUDED.api_key,
        api_secret = EXCLUDED.api_secret,
        passphrase = EXCLUDED.passphrase,
        private_key = EXCLUDED.private_key,
        updated_at = EXCLUDED.updated_at
    `;
    await query(sql, [subscriberId, encApiKey, encApiSecret, encPassphrase, encPrivateKey, now, now]);
  }

  async get(subscriberId: string): Promise<DecryptedCredentials | null> {
    const sql = 'SELECT api_key, api_secret, passphrase, private_key FROM tenant_credentials WHERE subscriber_id = $1';
    const result = await query(sql, [subscriberId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    return {
      apiKey: decrypt(row.api_key as string),
      apiSecret: decrypt(row.api_secret as string),
      passphrase: decrypt(row.passphrase as string),
      privateKey: decrypt(row.private_key as string),
    };
  }

  async delete(subscriberId: string): Promise<void> {
    const sql = 'DELETE FROM tenant_credentials WHERE subscriber_id = $1';
    await query(sql, [subscriberId]);
  }
}
```

---

## 5. Integration Hooks & Code Adjustments

### Ingestion Interface (`POST /api/subscriber/credentials`)
An authenticated endpoint must be exposed to write client credentials.
* **Authentication**: Enforced via JWT user context checking (e.g. `req.headers.Authorization`).
* **Input Validation**: Check that the private key is a valid 32-byte hex string (excluding `0x`), and other credentials are non-empty.
* **Storage Call**: Call `TenantCredentialsRepository.save(subscriberId, body)`.

### Execution Hook (`src/raas/subscriber-executor.ts`)
Instead of using environment variables during execution, credentials must be dynamically resolved per-tenant.

```typescript
// Inside SubscriberExecutor.execute()
const credentialsRepo = new TenantCredentialsRepository();
const creds = await credentialsRepo.get(subscriberId);
if (!creds) {
  throw new Error(`Credentials not configured for tenant: ${subscriberId}`);
}

// Instantiate client for specific tenant:
const clobClient = new SdkClobClient(CLOB_HOST, CHAIN_ID, undefined, {
  key: creds.apiKey,
  secret: creds.apiSecret,
  passphrase: creds.passphrase,
});
// Instantiate order signer:
const signer = new PolymarketSigner(creds.privateKey, CHAIN_ID);
```

---

## 6. Files to Touch

1. **`src/db/migrations/021_tenant_credentials.sql`** *(New)*
   * Define schema for GCM-encrypted credentials mapped to `subscriber_id`.
2. **`src/db/migration-runner.ts`** *(Modify)*
   * Import and register the new SQL migration inside `MIGRATIONS` array.
3. **`src/lib/license-key-crypto.ts`** *(Modify)*
   * Refactor `encryptLicenseKey` and `decryptLicenseKey` to use AES-256-GCM.
4. **`src/lib/credentials-crypto.ts`** *(New)*
   * Standard AES-256-GCM utility with environment-variable `CREDENTIALS_ENCRYPTION_KEY` validation.
5. **`src/db/tenant-credentials-repository.ts`** *(New)*
   * Repository wrapper for database CRUD of credentials, handles transparent encryption/decryption.
6. **`src/raas/subscriber-executor.ts`** *(Modify)*
   * Integrate repository lookup within trading pipeline execution.
7. **`src/api/routes/subscriber-credentials-routes.ts`** *(New)*
   * Express routes for uploading / rotating credentials.

---

## 7. Verification Plans & Test Strategy

### Unit Tests (`tests/unit/credentials-crypto.test.ts`)
Validate the GCM cryptographic routines under normal and abnormal conditions:
1. **Correctness**: Verify that `decrypt(encrypt("test")) === "test"`.
2. **Integrity Validation**: Tamper with the encrypted payload (e.g. change a character in the ciphertext or tag). Verify that `decrypt()` throws an authentication error.
3. **Key Safety**: Assert that `encrypt()` throws an error if `CREDENTIALS_ENCRYPTION_KEY` is undefined or not 32 bytes long.

### Integration Tests (`tests/integration/tenant-credentials.test.ts`)
Verify the database and repository lifecycle:
1. **Schema Check**: Apply migrations and confirm `tenant_credentials` table has the correct columns.
2. **Save & Retrieve**: Store decrypted credentials via repository, retrieve them, and verify decrypted content matches the input.
3. **Confirm DB Rest State is Encrypted**: Fetch raw row directly using SQL query without repository decryption. Verify that the raw database fields contain ciphertext and not plaintext (i.e. does not equal the original keys, contains colons `iv:tag:ciphertext`).

### E2E Flow Verification
1. Submit dummy credentials through the `POST /api/subscriber/credentials` endpoint.
2. Verify HTTP response is success.
3. Verify that the database stores ciphertext.
4. Trigger trading execution and check that the correct keys are loaded and decrypted for order signing.
