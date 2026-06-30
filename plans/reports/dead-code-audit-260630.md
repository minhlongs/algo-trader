# Dead Code Audit — 2026-06-30

## Confirmed Dead (no consumers, safe to delete)

### Large files (>200L)

| File | Lines | Evidence |
|------|-------|----------|
| `src/platform/audit/ai-decision-audit-service.ts` | 795L | Zero imports in entire codebase. `AIDecisionAuditService` class + singleton never used. Alternative `ai-decision-repository.ts` is used instead by `ai-audit-routes.ts`. |
| `src/platform/api/routes/xai-routes.ts` | 516L | Zero imports, NOT registered in `server.ts`. XAI endpoints defined but never reachable. `alphaear-client.ts` calls `/xai/*` paths but routes don't exist. |

### Entire directories

| Directory | Files | Evidence |
|-----------|-------|----------|
| `src/desk/citadel/` | 6 files | Zero external consumers. All exports (attestation-verifier, citadel-attest-cli, did-binder, measurement-hasher, quote-simulator) dead. |

### Fastify routes (never registered)

| File | Evidence |
|------|----------|
| `src/platform/api/routes/audit-routes.ts` | `registerAuditRoutes()` exported but never called |
| `src/platform/api/routes/api-key-routes.ts` | No import or registration found |
| `src/platform/api/routes/onboarding-routes.ts` | No import or registration found |
| `src/platform/api/routes/license-routes.ts` | No import or registration found |

## Partially Dead

### `src/desk/ironclaw/` (6 files, 1 live)

| File | Status | Evidence |
|------|--------|----------|
| `dlp-pattern-registry.ts` | **LIVE** | Imported by `platform/audit/dlp-pattern-matcher.ts` and `platform/audit/dlp-outbound-recorder.ts` (type imports) |
| `ironclaw-fetch-proxy.ts` | Dead | Only referenced internally by `index.ts` (also dead) |
| `dlp-action-dispatcher.ts` | Dead | No external consumers |
| `dlp-alert-emitter.ts` | Dead | No external consumers |
| `dlp-payload-redactor.ts` | Dead | No external consumers |
| `index.ts` | Dead | Barrel export, never imported externally |

**Action**: Delete 5 dead files, keep `dlp-pattern-registry.ts`. Consider moving to `platform/audit/` since that's where the consumers are.

## Not Dead (route files registered in server.ts)

The following "orphan" files are NOT dead — they're registered by name in `server.ts` as Express middleware:

`trades.ts`, `pnl.ts`, `signals.ts`, `admin.ts`, `revenue.ts`, `marketplace-strategy-routes.ts`, `marketplace-subscription-routes.ts`, `marketplace-review-routes.ts`, `marketplace-dispute-routes.ts`, `admin-marketplace-routes.ts`, `coupon-routes.ts`, `blog-routes.ts`, `analytics-routes.ts`, `subscriber-pnl-routes.ts`, `enterprise-inquiry-routes.ts`, `signal-ingest-routes.ts`, `admin-qwen-routes.ts`, `nowpayments-webhook.ts`, `admin-dna-routes.ts`, `ai-audit-routes.ts`, `credentials-routes.ts`, `personalization-routes.ts`, `referral-routes.ts`, `signal-feed-routes.ts`, `signal-subscription-routes.ts`

## Summary

| Category | Files | Lines |
|----------|-------|-------|
| Large dead files | 2 | 1,311L |
| Dead directory (citadel) | 6 | ~10,000L |
| Fastify dead routes | 4 | ~1,000L |
| Ironclaw dead (partial) | 5 | ~9,000L |
| **Total removable** | **17 files** | **~21,000L** |
