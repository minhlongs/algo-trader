# Phase 07 — Enterprise Tier + Onboarding UX ($49k-$499k) ✓ DONE

**Commits:** e1bff1a → 0b0ed8e (cherry-picked onto plan branch) | **11 files** | **19/19 tests pass** | **tsc clean**. Deferrals: inquiry route registration, Postgres persistence, CRM sync, TAM auth middleware, SOC 2 Type II.


**File ownership:** `src/billing/enterprise-tier-config.ts`, `src/billing/enterprise-contract-service.ts`, `src/billing/enterprise-sla-tracker.ts`, `src/billing/enterprise-onboarding-orchestrator.ts`, `src/billing/enterprise-demo-provisioner.ts`, `dashboard/src/pages/enterprise-landing.tsx`, `dashboard/src/pages/enterprise-demo.tsx`, `dashboard/src/pages/enterprise-onboarding.tsx`, `dashboard/src/components/enterprise-*.tsx`, `src/db/migrations/016_enterprise_*.sql`

**Depends on:** Phase 05 (signal API), Phase 06 (subscriber P&L)

## Context Links

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md` (sec 5 pricing)
- Scout: `plans/reports/scout-260416-2312-raas-reuse-surface.md` (sec 6 billing, BUILD-NEW #7)
- Existing: `src/billing/onboarding-service.ts`, `src/gate/config/tier-config.ts`, `dashboard/src/pages/pricing-page.tsx`

## Overview

- Priority: P1
- Status: pending
- Brief: Add Enterprise tier ($49k Starter, $149k Pro, $499k+ custom) with contract+SLA tracking, auto-provisioned paper-trading demo, enterprise-specific onboarding UX. Reuse existing billing+Polar/NowPayments plumbing.

## Key Insights

- Existing tier config has Starter/Pro/Elite; add Enterprise as 4th tier (premium above Elite)
- Enterprise = invoice-based (no self-serve checkout); contract record tracks MSA+SLA
- Paper-demo = sandboxed (Phase 02) with 30-day free access + 5 agents
- Reuse Better Auth onboarding, license-service.ts, api-key-manager.ts
- Polar wording safe (trading B2B SaaS, no wellness/medical)

## Requirements

**Functional:**
- Enterprise tier: unlimited agents, 24/7 support, SLA 99.5%+, dedicated TAM contact
- Contract service: store MSA PDF hash, start/end date, signed-by, SLA terms
- SLA tracker: uptime, signal latency, response time metrics
- Onboarding orchestrator: sales call → contract → provision → demo → go-live
- Demo provisioner: auto-create sandboxed subscriber with paper-trading data
- Enterprise landing page: B2B pitch (no consumer wording)
- Enterprise demo page: guided tour of dashboard with sample data
- Enterprise onboarding wizard: contract upload, team seats, BYOK setup

**Non-functional:**
- Demo provisioning < 30s
- SLA metrics dashboard refresh < 5s
- Contract PDF stored in R2 (not D1)

## Architecture

```
Sales-qualified lead ──> /enterprise/contact ──> TAM contact
                                                   │
TAM completes contract ──> contract-service stores MSA
                           │
                           ├──> onboarding-orchestrator
                           │       ├──> license-service (enterprise tier)
                           │       ├──> api-key-manager (initial keys)
                           │       ├──> demo-provisioner (paper sandbox)
                           │       └──> sla-tracker (baseline)
                           │
Subscriber ──> enterprise-onboarding wizard ──> go-live
```

## Related Code Files

**Create (src/billing/):**
- `src/billing/enterprise-tier-config.ts` (~120 LOC)
- `src/billing/enterprise-contract-service.ts` (~180 LOC)
- `src/billing/enterprise-sla-tracker.ts` (~150 LOC)
- `src/billing/enterprise-onboarding-orchestrator.ts` (~180 LOC)
- `src/billing/enterprise-demo-provisioner.ts` (~150 LOC)
- `src/billing/__tests__/enterprise-contract-service.test.ts`
- `src/billing/__tests__/enterprise-onboarding-orchestrator.test.ts`
- `src/billing/__tests__/enterprise-demo-provisioner.test.ts`

**Create (dashboard):**
- `dashboard/src/pages/enterprise-landing.tsx` (~180 LOC)
- `dashboard/src/pages/enterprise-demo.tsx` (~180 LOC)
- `dashboard/src/pages/enterprise-onboarding.tsx` (~180 LOC)
- `dashboard/src/components/enterprise-pricing-table.tsx` (~150 LOC)
- `dashboard/src/components/enterprise-contact-form.tsx` (~120 LOC)
- `dashboard/src/components/enterprise-onboarding-wizard.tsx` (~180 LOC)
- `dashboard/src/components/enterprise-sla-badge.tsx` (~60 LOC)

**Create (api):**
- `src/api/routes/enterprise-routes.ts` (~180 LOC)

**Modify:**
- `src/gate/config/tier-config.ts` — add Enterprise tier constants
- `src/billing/onboarding-service.ts` — delegate Enterprise path to orchestrator
- `dashboard/src/pages/pricing-page.tsx` — add Enterprise column
- `src/api/server.ts` — register enterprise routes
- `src/db/migrations/016_enterprise.sql` (tables: `enterprise_contracts`, `enterprise_sla_metrics`)

## Implementation Steps

1. Migration 016 — contract + SLA tables; R2 bucket for MSA PDFs
2. Build `enterprise-tier-config.ts` (feature flags: unlimited agents, realtime signals, custom SLA)
3. Extend `tier-config.ts` with Enterprise entry
4. Build `enterprise-contract-service.ts` (CRUD + PDF upload to R2)
5. Build `enterprise-sla-tracker.ts` (measures uptime, signal-lag, response-lag)
6. Build `enterprise-demo-provisioner.ts` (creates sandbox subscriber + 30-day paper data)
7. Build `enterprise-onboarding-orchestrator.ts` (state machine: lead→contract→provision→demo→live)
8. Build REST routes: `/api/enterprise/contact`, `/api/enterprise/contract`, `/api/enterprise/sla`
9. Build landing page (B2B copy, no wellness words)
10. Build demo page (interactive tour of subscriber-overview from Phase 06)
11. Build onboarding wizard
12. Update pricing-page with Enterprise tier
13. E2E: form submit → contract record → demo subscriber auto-created → SLA baseline captured

## Todo List

- [ ] Migration 016 applied + R2 bucket bound
- [ ] `enterprise-tier-config.ts` + test
- [ ] `tier-config.ts` Enterprise entry
- [ ] `enterprise-contract-service.ts` + test (PDF upload)
- [ ] `enterprise-sla-tracker.ts` + test
- [ ] `enterprise-demo-provisioner.ts` + test
- [ ] `enterprise-onboarding-orchestrator.ts` + state machine test
- [ ] `enterprise-routes.ts` + test
- [ ] Dashboard landing page
- [ ] Dashboard demo page
- [ ] Dashboard onboarding wizard
- [ ] Pricing page Enterprise column
- [ ] Polar wording scrub (no health/wellness/medical)
- [ ] E2E contact → demo provisioned

## Success Criteria

- `bun test src/billing/enterprise-*` green
- Contact form submit → contract draft → demo subscriber live < 60s
- Pricing page shows 4 tiers including Enterprise
- SLA dashboard renders
- Polar language scan: zero prohibited terms
- No `any` / `@ts-ignore`

## Risk Assessment

- **R1:** Enterprise sales cycle long → MVP = capture lead + manual TAM handoff; full auto-close later
- **R2:** MSA PDF liability → template reviewed by legal (external, out-of-scope for code)
- **R3:** SLA breach attribution → SLA metrics stored immutably (hash-chained via Phase 03 pattern)
- **R4:** Polar scan flag on enterprise page → pre-submit wording scrub per global rule

## Security Considerations

- Contract PDFs in R2 with bucket-level access control
- SLA metrics admin-only read
- BYOK onboarding reuses Phase 01 custody (no plaintext)

## Next Steps

- D2 (post-MVP): blockchain settlement for outcome-based pricing (% of agent earnings)
- K8s operator (Giai Doan 4) deferred — MVP uses CF Pages
- SOC 2 Type II audit (6-month operation precondition)
