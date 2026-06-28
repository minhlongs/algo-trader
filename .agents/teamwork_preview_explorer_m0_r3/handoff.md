# Handoff Report — R3: AES-256 Encryption at Rest

## 1. Observation
I investigated the codebase to determine the existing status of credential storage and cryptographic patterns:
* **Database Schema & Migrations:** 
  * `src/db/schema.sql` (lines 5-45) shows three tables: `trades`, `pnl_daily`, and `performance_metrics`. None of them store API keys or secrets.
  * In `src/db/migrations/`, `004_better_auth_tables.sql` (lines 26-41) defines `account` and `user` tables for login credential hash/salt storage. `015_subscriber_attribution.sql` (lines 5-30) maps `subscriber_id` to trades and signals, but does not define any credential storage. No other migration defines credential fields.
* **Plaintext Storage in Licenses:** 
  * `data/licenses.json` contains plaintext license records:
    ```json
    "key": "RAAS-RPP-HLXDOK7N-53T9ABQF"
    ```
  * `src/billing/license-service.ts` (lines 83-106) writes generated license keys to the JSON store in plaintext without calling any encryption helper.
* **Unused CBC Cryptography:** 
  * `src/lib/license-key-crypto.ts` (lines 101-121) defines encryption using `aes-256-cbc`:
    ```typescript
    const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
    ...
    return iv.toString('hex') + ':' + encrypted;
    ```
    This function has no active call sites in the `src/` directory.
* **Environment-Based Credentials:** 
  * Polymarket credentials are read globally from environment variables in `src/polymarket/clob-client.ts` (lines 43-46) and `src/polymarket/clob-v2-adapter.ts` (lines 61-64):
    ```typescript
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const apiKey = process.env.POLYMARKET_API_KEY;
    ```

---

## 2. Logic Chain
1. Since the PostgreSQL database contains no credentials table (Observation 1), a new table migration (`tenant_credentials`) is required to support the at-rest storage of BYOK multi-tenant credentials.
2. Because the current cryptography functions in `src/lib/license-key-crypto.ts` use `AES-256-CBC` (Observation 3) and the prompt requires `AES-256-GCM`, we must refactor this utility. GCM generates an authentication tag that must be persisted alongside the IV and ciphertext. We will adjust the format to `iv:tag:ciphertext`.
3. Since existing license key records in `data/licenses.json` are stored in plaintext and CBC functions are unused (Observation 2 & 3), changing the serialization layout to GCM will not break active production key decoding.
4. For clean architecture, we will encapsulate credentials-specific database operations and encryption inside a dedicated `TenantCredentialsRepository` and generic `credentials-crypto` wrapper, which dynamically loads/decrypts parameters per-tenant.
5. In order execution (`src/raas/subscriber-executor.ts`), the global fallback to `process.env.POLY_API_KEY` (Observation 4) must be replaced with a dynamic database lookup through the repository prior to instantiating the exchange clients.

---

## 3. Caveats
* **Legacy Decryption:** Although the license key encryption functions are currently unused, we have included a backward-compatible check (`parts.length === 2`) in the refactored code to decrypt legacy CBC data if it is ever encountered.
* **Key Lifecycle:** This investigation assumes that the master key (`CREDENTIALS_ENCRYPTION_KEY` / `LICENSE_ENCRYPTION_KEY`) is securely provisioned in the hosting environment (e.g. AWS KMS, Docker secrets, or Cloudflare KV environment variables) and is exactly 32 bytes long.

---

## 4. Conclusion
We have mapped the requirements to concrete architectural steps:
1. **Schema Addition:** Create `021_tenant_credentials.sql` to define a PostgreSQL table mapped to `subscriber_id`.
2. **Crypto Upgrade:** Swap `aes-256-cbc` for `aes-256-gcm` in `license-key-crypto.ts` and build a credentials-crypto helper.
3. **Repository Injection:** Hook up the repository inside the sandbox execution loop (`SubscriberExecutor.execute()`) to support multi-tenant live trading.
Detailed file lists and implementation templates are archived in `analysis.md`.

---

## 5. Verification Method
Verify the setup using the following steps:
1. **Unit Verification:**
   Run the test command `npm run test` (via Vitest) to check that the refactored `license-key-crypto` works. 
   Add a unit test `tests/unit/credentials-crypto.test.ts` to assert that tampered tags or invalid ciphertexts fail decryption:
   ```typescript
   // Expected error verification:
   expect(() => decrypt(tamperedPayload)).toThrow();
   ```
2. **Database Schema Verification:**
   Apply migrations using the server runner or `npm run setup` / `pnpm exec ts-node src/db/migration-runner.ts` and inspect database structure using SQL:
   ```sql
   \d tenant_credentials;
   ```
   Confirm columns: `subscriber_id`, `api_key`, `api_secret`, `passphrase`, `private_key`, `created_at`, `updated_at`.
3. **At-Rest Plaintext Check:**
   Write dummy credentials through `TenantCredentialsRepository`, query the row directly using raw Postgres query, and assert that fields do not contain any plaintext words, matching the `iv:tag:ciphertext` format.
