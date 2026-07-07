---
priority: P0
status: pending
title: "Phase 2: SignalProviderOnboarding"
estimated_days: 3
---

# Phase 2: SignalProviderOnboarding

## Overview

API key verification → backtest validation → 7-day paper trading requirement → approve/reject. Thin orchestrator over existing services.

## Architecture

```text
ProviderSubmission → ProviderOnboardingAgent → API key verify (LicenseService)
                                     → validate backtest (existing backtest infra)
                                     → start 7d paper trading (paper-trading-engine)
                                     → auto-approve if all pass
```

## Key Findings from Research

- Existing backtest infra in `src/engine/strategy-runner.ts` + `src/engine/trade-executor.ts`
- Paper trading engine: `src/paper-trading/paper-exchange.ts`
- License/API key management: `src/lib/license-key-lifecycle.ts`, `src/platform/billing/license-service.ts`
- Strategy storage: `src/strategies/` directory
- Queue pattern: `AgentQueueManager` + BullMQ (Redis required)

## Files to Create

- `src/api/routes/provider-onboarding-routes.ts` — Submit / status / cancel endpoints
- `src/agentic/signal-provider-onboarding.ts` — Orchestrator agent class
- `src/agentic/types/provider-onboarding.ts` — Shared types

## Types to Define

```ts
interface ProviderApplication {
  applicantId: string;
  email: string;
  strategyId: string;
  apiKeySnapshot: string; // masked, for verification
  status: ApplicationStatus;
  createdAt: number;
  // Derivation stages
  apiKeyVerified: boolean;
  backtestPassed: boolean;
  paperTradingComplete: boolean;
  paperTradingResult?: PaperTradingResult;
  approvedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
}
```

## Implementation Steps

1. Create types file with Zod schemas for submission + status response
2. Implement `SignalProviderOnboardingAgent`:
   - `submitApplication(payload)` → queues verification job
   - `processApiKeyVerify(job)` → calls LicenseService.validateLicense()
   - `processBacktestValidate(job)` → runs strategy-runner on last 30d OHLCV
   - `startPaperTrading(appId)` → enqueues paper-trading job with 7d TTL
   - `checkPaperTradingProgress(appId)` → polls paper-exchange for P&L, sharpe
3. Wire job types to BullMQ queue names from `agent-config.ts`
4. Add Express routes: `POST /api/v1/provider/apply`, `GET /api/v1/provider/:id/status`, `POST /api/v1/provider/:id/cancel`
5. Register routes in `server.ts` under `/api/v1/provider`
6. Write tests: submit flow, API key reject, backtest fail, paper trading success
7. Add D1 migration for `provider_applications` table (or reuse existing `subscriptions` if schema compatible)

## Acceptance Criteria

- [ ] POST /api/v1/provider/apply creates pending application
- [ ] Invalid API key → immediate rejection
- [ ] Failed backtest → rejection within ~30s
- [ ] Paper trading auto-completes after 7d (or manual trigger for testing)
- [ ] Approved provider gets signal publishing rights
- [ ] All errors return structured JSON with `{ error, detail }`

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Backtest data missing for strategy | Medium | Medium | Return clear error "no historical data" |
| 7d wait blocks tester | High (dev) | Low | Add `--fast-approve` env flag to skip paper trading |
| Duplicate submission | Low | Low | Idempotency key on submit |

## Rollback

Remove routes + agent class. `provider_applications` table drop can be deferred (orphan data doesn't affect other tables).
