## 2026-05-30T12:13:23Z
Objective:
Implement database-backed encryption at rest using AES-256-GCM for tenant exchange credentials, expose a credentials ingestion API, and integrate decryption verification into the trading pipeline executor.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Steps to perform:
1. Create database migration `src/db/migrations/021_tenant_credentials.sql` to define the table `tenant_credentials`:
   - Columns: `subscriber_id` (TEXT PRIMARY KEY), `api_key` (TEXT NOT NULL), `api_secret` (TEXT NOT NULL), `passphrase` (TEXT NOT NULL), `private_key` (TEXT NOT NULL), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ).
   - Index on `subscriber_id`.
   - Register it in `src/db/migration-runner.ts` (both up-migration and down-migration drops).
2. Refactor `src/lib/license-key-crypto.ts` to transition from AES-256-CBC to AES-256-GCM.
   - Standard GCM IV: 12 bytes.
   - Return/persist format: `iv_hex:tag_hex:ciphertext_hex` (3 parts).
   - Keep a backward-compatibility check: if `parts.length === 2`, decrypt using `aes-256-cbc`.
3. Create `src/lib/credentials-crypto.ts` implementing AES-256-GCM encryption/decryption utilities using `process.env.CREDENTIALS_ENCRYPTION_KEY` (must be 32 bytes) as the key.
4. Create `src/db/tenant-credentials-repository.ts` implementing a repository class `TenantCredentialsRepository` containing:
   - `save(subscriberId, creds)`: encrypts `apiKey`, `apiSecret`, `passphrase`, `privateKey` and saves them in `tenant_credentials`.
   - `get(subscriberId)`: fetches the credentials from `tenant_credentials` and decrypts them.
   - `delete(subscriberId)`: deletes the credentials from `tenant_credentials`.
5. Create a new Express router `src/api/routes/credentials-routes.ts` exposing:
   - `POST /api/v1/subscriber/credentials`: accepts JSON body containing `apiKey`, `apiSecret`, `passphrase`, `privateKey`. Validates input, checks authorization (assert tenant access via JWT sub claim), encrypts, and saves via the repository.
   - Register the router in `src/api/server.ts` mounted at `this.app.use('/api/v1/subscriber/credentials', credentialsRouter)` (or integrate it directly in server.ts).
6. Integrate decryption resolution in `src/raas/subscriber-executor.ts`:
   - Inside `SubscriberExecutor.execute()`, check for credentials in `TenantCredentialsRepository` for the given `subscriberId`. If they don't exist, throw an Error. This ensures the trading pipeline is blocked if credentials aren't set up.
7. Make sure NO `any` or `@ts-ignore` are used anywhere in your code.
8. Write unit and integration tests under `tests/unit/credentials-crypto.test.ts` and `src/api/__tests__/credentials.test.ts` to verify the GCM crypto functions, the repository, the ingestion API endpoints, and the executor validation path.
9. Verify TypeScript compiles strictly (`npx tsc --noEmit`) and all tests pass cleanly.
