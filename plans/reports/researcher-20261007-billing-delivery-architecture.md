# Technical Research: Billing Gateway, Webhook Reliability & Automated Onboarding

## Executive Summary & Stack Fit
- **Project**: CashClaw / Algo Trader (Edge Cloudflare Workers + Node.js/Express + PostgreSQL + D1/KV).
- **Core Requirement**: Bulletproof NOWPayments IPN ingestion, tamper-evident license lifecycle, automated 3-step onboarding, and resilient D1-PostgreSQL metering sync under KISS/YAGNI/DRY.

## 1. NOWPayments IPN Webhook Hardening
- **HMAC-SHA512 Verification Defect & Fix**:
  - *Critical Finding*: NOWPayments signs payload after recursively sorting dictionary keys alphabetically (`ksort`). Current implementations (`nowpayments-service.ts`, `webhooks-nowpayments.ts`, `tier-activation-gateway.ts`) hash raw body string directly, causing false 401 signature rejections in live production.
  - *Fix*: Parse JSON, sort keys alphabetically (`Object.keys().sort()`), re-serialize without extra whitespace, and compute HMAC-SHA512 using `NOWPAYMENTS_IPN_SECRET`.
  - *Timing Protection*: Enforce `crypto.timingSafeEqual` across all endpoints to eliminate side-channel timing attacks (present in gateway, missing in `nowpayments-service.ts`).
- **Idempotency & Replay Defense**:
  - Edge Worker: Checks `payment_logs` for `(invoice_id, status)` tuple before processing; duplicate hits return HTTP 200 with `{ received: true, dedup: true }`.
  - Origin Service: `webhook-resilience.ts` maintains 1-hour TTL LRU cache (`processedIds`) to suppress duplicates.
- **Status Progression & Handling**:
  - Non-terminal states (`waiting`, `confirming`, `sending`): Return HTTP 200 immediately, do not mutate state.
  - Terminal success (`finished`, `confirmed`): Provision subscription, link license, record audit log.
  - Terminal failure/refund (`failed`, `refunded`, `expired`): Cancel subscription, revoke license, evict KV tier cache.
- **Sandbox vs. Production**:
  - Sandbox URL: `https://api-sandbox.nowpayments.io/v1` vs. Production `https://api.nowpayments.io/v1`.
  - Sandbox mandates simulated payments; production requires mainnet blockchain confirmations (USDT-TRC20).
  - Segregate keys via environment: `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET`.

## 2. License Key Provisioning Lifecycle & Cryptography
- **Engine Consolidation (KISS/DRY)**:
  - Existing codebase has split implementations: naive random strings in `license-service.ts` (`RAAS-<tier>-<rand>-<rand>`) vs. cryptographic tokens in `license-key-crypto.ts` (`ALGO-<tier>-<timestamp>-<rand>-<checksum>`).
  - *Decision*: Consolidate onto `license-key-crypto.ts` format. Uses SHA-256 HMAC checksum verification with `LICENSE_ACTIVATION_SECRET` and AES-256-GCM authenticated encryption for database persistence.
- **Lifecycle Transitions**:
  - `pending` (issued upon checkout/invite) -> `active` (verified via OTP or IPN `finished`) -> `revoked` / `expired`.
- **Revocation & Invalidation**:
  - Revocation updates `status = 'revoked'` in DB/file store via `licenseRouter.patch('/:id/revoke')`.
  - Edge invalidation: Invalidate Cloudflare KV cache `tier:${userId}` immediately upon revocation to prevent 300s window of unauthorized access.

## 3. Automated Customer Onboarding & Welcome Sequence
- **3-Step State Machine (`onboarding-service.ts`)**:
  1. *Signup* (`POST /api/v1/signup`): Validates email, enforces single active license, creates pending row in `onboarding_signups` (15-min TTL), dispatches 6-digit OTP.
  2. *Verify* (`POST /api/v1/verify`): Validates 6-digit OTP, checks expiration, transitions state `pending` -> `verified`.
  3. *Activate* (`POST /api/v1/activate`): Transitions `verified` -> `activated`, provisions license key, generates `curl` onboarding instructions, enqueues welcome drip.
- **State Transition (Free -> Paid)**:
  - Free users complete self-serve OTP flow.
  - Upgrading to Paid: Frontend invokes `createCheckoutUrl()`; upon payment, NOWPayments IPN dispatches to `handleIpnFinished`, which maps order reference to email, sets tier to `PRO`/`ENTERPRISE`, updates KV `tier:${userId}`, and persists subscription.
- **Welcome Sequence Delivery (`welcome-email-drip.ts`)**:
  - Day 0 (0h): Welcome, Telegram bot linking instructions (`/link <key>`), dashboard link.
  - Day 1 (24h): Core features guide (Endgame strategy, Kelly risk management).
  - Day 3 (72h): Power trader tips + upgrade CTA for free tiers. State persisted in JSON/DB and polled hourly.

## 4. Failover Resilience, Rate Limiting & Metering Sync
- **D1-PostgreSQL Metering Pipeline (`d1-postgres-metering-sync.ts`)**:
  - Edge collection writes high-throughput metrics to Cloudflare D1 `edge_metering_events`.
  - Scheduled reconciler pulls batches (size 100) using high-water mark checkpoint in `metering_sync_checkpoints`.
  - Idempotent upsert to central PostgreSQL `central_metering_ledger` via `ON CONFLICT DO UPDATE`.
  - Error isolation: Database connection drop sets status `FAILED`, preserves checkpoint, and avoids duplicate count increments.
- **Edge Failover**:
  - If D1 is unavailable in Worker, handler falls back to Cloudflare KV (`ipn:${invoiceId}:${status}`) and returns HTTP 200 to prevent NOWPayments retry storms.
  - Origin retry: `webhook-resilience.ts` implements exponential backoff (1s, 2s, 4s, 8s, 16s, max 5 attempts) and dead-letter queue with manual replay (`POST /dead-letter/:id/retry`).
- **Tier-Based Rate Limiting (`seed/config/tiers.ts`)**:
  - FREE: 10 req/min, burst 2/sec.
  - PRO: 100 req/min, burst 20/sec.
  - ENTERPRISE: 1,000 req/min, burst 100/sec.
  - MASTER: Unlimited (0 limit).
  - Enforced via Token Bucket middleware backed by Redis/KV.

## 5. Trade-off Matrix
| Architecture Dimension | Edge-First (Workers + D1/KV) | Central Origin (Node + PG) | Hybrid Architecture (Selected) |
| :--- | :--- | :--- | :--- |
| **Availability & Uptime** | High (Global PoPs, 99.99%) | Vulnerable to single VPS outage | High (Edge absorbs webhooks, async core sync) |
| **Processing Latency** | Ultra-low (<30ms) | Moderate (150-300ms cross-region) | Ultra-low at edge, batched reconciliation |
| **Implementation Complexity** | Medium (dual schema sync) | Minimal (single DB) | Low-Medium (checkpoint sync already written) |
| **Operational Maintenance** | Low (Serverless) | High (VPS patching, PM2 cron) | Low (Managed D1/KV + resilient worker) |

## 6. Adoption Risk & Ranked Recommendations
- **Rank 1: Fix Alphabetical Key Sorting in HMAC Verification** (*Severity: Critical*):
  - Risk: 100% of production NOWPayments IPNs will fail verification unless keys are sorted prior to hashing.
- **Rank 2: Standardize on Cryptographic License Format** (*Severity: High*):
  - Risk: Plaintext keys in `license-service.ts` can be forged; adopt `license-key-crypto.ts` with AES-256-GCM.
- **Rank 3: Migrate In-Memory Dead-Letter Queue to D1/Postgres** (*Severity: Medium*):
  - Risk: Process restarts in `webhook-resilience.ts` purge failed webhook queues.
- **Rank 4: Add Proactive KV Cache Invalidation on Webhook Cancel** (*Severity: Low*):
  - Risk: Stale KV cache allows cancelled/refunded users 5-minute grace period before downgrade.

## 7. Sources Consulted
- [NOWPayments API Documentation & Instant Payment Notifications](https://documenter.getpostman.com/view/7907941/S1a32n38)
- [Cloudflare Workers D1 Documentation](https://developers.cloudflare.com/d1/)
- [Node.js Crypto API - Timing Safe Equal](https://nodejs.org/api/crypto.html#cryptotimingsafeequaldigest-signature)
- Algo-Trader internal implementations (`nowpayments-webhook.ts`, `tier-activation-gateway.ts`, `onboarding-service.ts`, `d1-postgres-metering-sync.ts`)

## 8. Limitations & Unresolved Questions
- *Limitations*: Concurrency stress tests above 5,000 RPS on D1 batch sync were not benchmarked.
- *Unresolved Questions*:
  - Does NOWPayments webhook retry cadence exceed 24 hours on persistent origin outages?
  - Should `partially_paid` crypto payments auto-generate a supplemental top-up invoice or trigger manual support?
