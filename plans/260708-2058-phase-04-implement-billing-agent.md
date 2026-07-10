# Phase 4: Implement BillingAgent

## Context
- Plan: `plans/260708-2058-phase-04-implement-billing-agent.md`
- Reports: relevant billing analysis and metrics

## Overview
**Priority:** Medium — Payment pipeline billing workflow  
**Current Status:** Ready to implement

Implement the BillingAgent as a standalone service with hooks into the existing NOWPayments webhook handler. The agent is responsible for revenue tracking and invoice generation — it does NOT replace the webhook handler.

## Key Insights

- The webhook handler (`src/platform/workers/webhook-handlers.ts`) runs on Cloudflare Workers with raw Request/Env, no Express
- `generateInvoice()` already handles file-storage + SendGrid email
- `generateRevenueShareBreakdown` uses simple fixed splits (70/30 or 60/40)
- All billing files are synchronous; webhook handler runs in http event context, which is async but doesn't block other events

## Requirements

### Functional
- Invoice generation on successful payment (with SendGrid email)
- Idempotency: skip duplicate payment IDs
- Revenue share breakdown per tier: STARTER/PRO = 70% platform / 30% provider; ENTERPRISE = 60% / 40%
- Log revenue share to console (or analytics sink if available)
- Alert operator for payments ≥ $299

### Non-Functional
- Zero `:any` types
- Zero `console.log` — use existing `logger`
- Mockable for unit tests
- No DB schema changes required

## Architecture

```
NOWPayments IPN Webhook (src/platform/workers/webhook-handlers.ts)
  └── validates signature
      └── normalizes payment status
          └── store activation in KV (EXISTING)
          └── NEW: billingAgent.onPaymentCompleted(payment)
                ├── idempotency check
                ├── generateRevenueShareBreakdown()
                ├── recordRevenueShare() (logs)
                ├── alertOperatorIfHighValue() (logs if ≥ $299)
                └── generateInvoice() → email via SendGrid
```

**BillingAgent is a pure TS class** — no CF-specific types in its interface. It dynamically imports `generateInvoice` only when needed (avoid circular deps between `src/agentic/` and `src/platform/` when the platform layer also references the agentic layer).

## Related Code Files

### To Modify
- `src/platform/workers/webhook-handlers.ts` — add import + billingAgent call at paid block

### To Create (already being created)
- `src/agentic/billing-agent.ts`
- `tests/unit/billing-agent.test.ts`

## Implementation Steps

### Step 1: Create BillingAgent class
**File:** `src/agentic/billing-agent.ts`

```ts
import { logger } from '../shared/utils/logger';

export interface Payment {
  paymentId: string;
  email: string;
  amount: number;
  currency: string;
  tier: string;
}

interface RevenueBreakdown {
  platform: number;
  provider: number;
  platformPct: number;
  providerPct: number;
}
```

### Step 2: Define pricing tiers for revenue split
```ts
const SPLIT_BY_TIER: Record<string, { platform: number; provider: number }> = {
  STARTER: { platform: 0.7, provider: 0.3 },
  PRO: { platform: 0.7, provider: 0.3 },
};
```

### Step 3: Wire BillingAgent into webhook handler
**File:** `src/platform/workers/webhook-handlers.ts`

Inside `if (normalizedStatus === 'paid')` block, insert billing calls AFTER existing activation KV store.

## Todo List

- [x] 1. Create `src/agentic/billing-agent.ts` — core class with private helpers
  - [x] `processPaymentCompleted()` entry point with idempotency guard
  - [x] `generateRevenueShareBreakdown()` — static split lookup
  - [x] `recordRevenueShare()` — logger.info with breakdown
  - [x] `alertOperatorIfHighValue()` — logger.warn if amount >= 299
  - [x] `generateInvoiceAndEmail()` — dynamic import of `generateInvoice()`, void return
- [x] 2. Create `tests/unit/billing-agent.test.ts`
  - [x] `processPaymentCompleted → invoice generated` (mocked) ✅
  - [x] `processPaymentCompleted → duplicate paymentId skipped` ✅
  - [x] `generateRevenueShareBreakdown` for STARTER/PRO (70/30) ✅
  - [x] `generateRevenueShareBreakdown` for ENTERPRISE (60/40) ✅
  - [x] `generateRevenueShareBreakdown` for MASTER (60/40) ✅
  - [x] `generateRevenueShareBreakdown` for ELITE (60/40) ✅
  - [x] `generateRevenueShareBreakdown` for unknown tier (FALLBACK to 70/30) ✅
  - [x] `generateRevenueShareBreakdown` — case-insensitive ✅
  - [x] `generateRevenueShareBreakdown` — rounding to 2dp ✅
- [x] 3. Modify webhook handler to call BillingAgent

## Success Criteria

- [x] `npx vitest run tests/unit/billing-agent.test.ts` → all tests pass
- [x] `tsc --noEmit` passes for `src/agentic/billing-agent.ts`
- [x] Webhook handler compiles with new import (no circular deps)
- [x] No `:any` types in new code
- [x] `npm run lint` passes for modified files

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Circular import between agentic/ and platform/ | Medium | High | Use dynamic import for `generateInvoice` inside the private method |
| Invoice generation fails silently in CF Worker | Medium | Medium | Logger caught the error — operators notice via logs |
| tc39: Set is not polyfilled in CF Workers | Low | Low | Map-based idempotency fallback if needed |

## Security Considerations

- No secrets or credentials are hardcoded (all via env var or compile-time config)
- Invoice email content is rendered via template literals with XSS-escaped fields (already handled in invoice-generator.ts)
- Tier split percentages are constants — no user input influencing financial math

## Next Steps

- [x] Done — ready for code review
