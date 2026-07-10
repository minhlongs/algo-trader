---
title: Phase 2 — Staging CF Worker Config
status: pending
priority: P1
phase: 2
dependsOn: [phase-01]
---

# Phase 2: CF Worker Staging Environment

## Overview

Wire NOWPayments sandbox credentials into the `staging` environment of the CF Worker and deploy.

## Key Insights

- `wrangler.toml` already has `[env.staging]` block (line 79, 141 lines)
- Secrets use `wrangler secret put` — never committed to git
- Public vars (invoice IDs, base URL) can live in `[env.staging.vars]`
- KV namespace shared with production (`6c7199c0259b42db943aa13b200d8ea1`) — staging inherits same ID
- Durable Objects bindings are already defined for staging

## Requirements

1. Auth: `wrangler login` with CF account that owns `algo-trader` worker
2. Sandbox secrets from Phase 1 uploaded via `wrangler secret put`
3. Staging-specific vars: sandbox base URL override, test invoice IDs, test IPN URL

## Steps

### 1. Authenticate

```bash
cd /Users/macbook/algo-trader
wrangler login
```

### 2. Wire Secrets (sandbox credentials)

```bash
# API key for sandbox REST calls
wrangler secret put NOWPAYMENTS_API_KEY --env staging
# → paste test API key from Phase 1

# IPN secret for webhook signature verification
wrangler secret put NOWPAYMENTS_IPN_SECRET --env staging
# → paste test IPN secret from Phase 1
```

### 3. Wire Public Vars (test invoice IDs + sandbox URL)

Edit `wrangler.toml` — add under `[env.staging.vars]`:

```toml
[env.staging.vars]
ENVIRONMENT = "staging"
NOWPAYMENTS_INVOICE_PRO = "<from Phase 1>"
NOWPAYMENTS_INVOICE_ENTERPRISE = "<from Phase 1>"
NOWPAYMENTS_IPN_URL = "https://algo-trader-staging.workers.dev/api/v1/webhooks/nowpayments"
```

### 4. Append Sandbox Override (Next.config)

Check if `src/platform/billing/nowpayments-service.ts` respects a `NOWPAYMENTS_BASE_URL` env var. If yes, set it via `wrangler secret put` or add to vars. If not, the staging test script will use the sandbox base URL directly when creating invoices (API call comes from script, not from handler).

### 5. Deploy

```bash
wrangler deploy --env staging
```

### 6. Verify Health

```bash
curl https://algo-trader-staging.workers.dev/api/health
# Expected: HTTP 200
```

## Files Touched

| File | Change |
|---|---|
| `wrangler.toml` | Add 4 vars under `[env.staging.vars]` |
| `.gitignore` | Add `staging.env` (if not already present) |

## Runtime Considerations

- Staging KV namespace ID is same as production (`6c7199c0259b42db943aa13b200d8ea1`) — data is isolated by env prefix in CF, so staging writes won't pollute prod cache
- Durable Objects (shards) are also isolated by env — staging gets its own DO instances
- The handler code is shared (same build), so any code bug in production will also affect staging — this is the correct behavior for E2E validation

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Staging KV shared ID causes data collision | Low CF enforces env isolation internally | Verify with CF docs; different env = different KV namespace instance |
| `wrangler secret put` fails (not logged in) | Low | Run `wrangler login` first |
| Deploy fails due to missing bindings | Low | Staging block already mirrors prod bindings in `wrangler.toml` |

## Success Criteria

- [ ] `wrangler secret put` succeeds for both secrets
- [ ] `wrangler.toml` staging vars updated with test invoice IDs
- [ ] `wrangler deploy --env staging` exits 0
- [ ] `curl https://algo-trader-staging.workers.dev/api/health` → 200
- [ ] `.gitignore` contains `staging.env`
