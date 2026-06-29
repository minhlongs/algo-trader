# Architecture Audit — Algo-Trader RaaS Platform

**Date**: 2026-06-29
**Mode**: Full platform audit, hybrid desk+RaaS model, strict separation
**Flags**: --auto --parallel
**Tests**: 196 files, 2,214 tests — all passing
**Source**: 540 .ts files, ~95K LOC, 65 modules

---

## Problem Statement

The algo-trader codebase has outgrown its original "solo quant desk" framing. It now contains a full RaaS platform alongside proprietary trading infrastructure — with no clear boundary between them. The manifesto prohibits multi-tenancy; the roadmap plans marketplace + subscriptions. This audit defines the separation architecture and migration path.

## Key Findings

### Module Health

| Metric | Value | Assessment |
|--------|-------|-----------|
| Modules with zero tests | 30 of ~65 | Critical risk for financial platform |
| Largest file | 795 lines (ai-decision-audit-service.ts) | 4x the 200-line limit |
| Files >400 lines | 22+ | Copy-paste pattern in Polymarket strategies |
| TODO markers | 4 | Codebase is clean of deferred work |
| Active WIP | 40 modified files, 5 deleted migrations | Mid-refactor state |

### Modules Without Tests (30)
accounting, analytics, assignment, auth, backpressure, backup, cex, cli, commands, config, coordination, core, data, events, exchanges, interfaces, landing, markets, middleware, persistence, polymarket, referral, resilience, sandbox, testing, types, ui, utils, validation, workers

### Copy-Paste Hotspots
20+ Polymarket strategy files share identical structure (~450 lines each): `vwap-deviation-sniper.ts`, `vol-compression-breakout.ts`, `pivot-point-bounce.ts`, `regime-adaptive-momentum.ts`, `cross-event-drift.ts`, `whale-tracker.ts`, etc. Estimated ~9,000 lines of near-duplicate code — should be base class + strategy-specific config (~2,000 lines after refactor).

### Working Tree Chaos
40 files modified (+1151/-1300). Deleted migrations 021, 024, 025. Marketplace service heavily rewritten (456-line reduction). Recovery manager expanded by 114 lines. This is an incomplete refactor — must stabilize before adding features.

### Doctrinal Tension
Manifesto Chapter V: "We will not multi-seat this. There is no team dashboard, no permissions model, no shared workspace." Roadmap Phase 36: marketplace with 80/20 revenue sharing, multi-tenant strategy subscriptions. These cannot coexist without a boundary.

---

## Evaluated Approaches

### A: Strict Separation (CHOSEN)
Split into `desk/` (solo prop trading) + `platform/` (RaaS SaaS) + `shared/` (kernel). Clean boundaries, independently testable, manifesto stays true, platform scales separately.

### B: Platform-Only
Go all-in on RaaS. Delete manifesto constraints. Single SaaS focus. Rejected: loses "solo desk" differentiator that drives the build-in-public narrative.

### C: Triage First
2-4 week stabilization before deciding direction. Rejected as standalone — stabilization is folded into Phase 1 of the separation plan.

---

## Final Architecture

### Boundary Map

```
src/
├── shared/           # Kernel — NO business logic
│   ├── types/        # Shared interfaces, enums
│   ├── config/       # Env config, constants
│   ├── db/           # Prisma client, migrations, postgres-client
│   ├── utils/        # Logger, rate-limiter primitive, crypto utils
│   └── validation/   # Zod schemas (shared contracts only)
│
├── desk/             # Solo proprietary trading
│   ├── strategies/   # 52+ strategies (all owned by desk)
│   ├── execution/    # CLOB adapter, order mgmt, paper executor
│   ├── risk/         # Kelly Criterion, drawdown protection
│   ├── intelligence/ # Dual-model LLM pipeline (Nemotron + DeepSeek)
│   ├── signal/       # Signal fusion, TTL, publishing pipeline
│   ├── market-data/  # Provider failover, gap detection, SLA
│   ├── polymarket/   # PM-specific adapters
│   ├── cex/          # CCXT exchange integration
│   ├── dex/          # Uniswap, Jupiter adapters
│   ├── feeds/        # WebSocket price feeds
│   ├── cli/          # Operator CLI (Commander.js)
│   ├── ml/           # GRU neural net, TensorFlow models
│   └── markets/      # Market regime detection
│
│   RULES:
│   • No tenantId column or filter
│   • No pricing tier checks
│   • No subscriber context
│   • CLI-only interface (no REST for trading)
│   • Manifesto-compliant (single operator)
│
└── platform/         # RaaS subscriber platform
    ├── raas/         # Sandbox executor, DLP, attestation
    ├── marketplace/  # Strategy listings, reviews, vetting
    ├── billing/      # NOWPayments IPN, invoices, tier activation
    ├── auth/         # Better Auth, session management
    ├── api/          # REST + WebSocket gateway
    ├── dashboard/    # React 19 subscriber UI
    ├── metering/     # Usage tracking, threshold alerts
    ├── middleware/    # Rate limiting, feature gates, metrics
    ├── audit/        # Compliance logging, audit trails
    ├── referral/     # Affiliate program
    ├── workers/      # CF edge proxy, auth handlers
    ├── telegram/     # Bot commands
    ├── notifications/# Email (SendGrid), alerts
    └── messaging/    # NATS JetStream, BullMQ

    RULES:
    • tenantId on EVERY query (buildTenantFilter)
    • Tier-gated feature access (FREE/PRO/ENTERPRISE/MASTER)
    • Per-tenant DLP isolation (subscriber prefix check)
    • NOWPayments IPN for payment processing
    • REST + WebSocket API surface
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Strategy ownership | Desk owns all 52+ strategies | Platform subscribers access via tier-gated config, not code duplication |
| DB schema | Shared DB, tenant-column only in platform tables | Desk tables: no tenantId. Platform tables: always tenantId. Shared tables: no tenantId |
| Auth location | Platform only | Desk = single operator via CLI/env. No user concept needed on desk side |
| API surface | Platform = REST+WS. Desk = CLI only | Desk is operator-only; platform is subscriber-facing |
| LLM pipeline | Desk only | Proprietary alpha. Subscribers consume signals, not raw inference |
| Migration order | Shared → Platform → Desk | Dependency chain; desk may reference platform user_ids for attribution |

### Strategy Access Model

Desk runs all 52+ strategies on proprietary capital. Platform subscribers get subsets by tier:

| Tier | Strategies | Markets | Execution |
|------|-----------|---------|-----------|
| FREE | 1 (paper only) | Polymarket | Delayed 15min |
| PRO | 5 | PM + 1 CEX | Real-time |
| ENTERPRISE | 20 | All markets | Real-time |
| MASTER | Unlimited | All + custom | Real-time + API |

Each strategy is tagged with `minTier` in config. Platform reads config; desk ignores it.

---

## Migration Plan

### Phase 1 — Stabilize (Week 1-2)
- Complete working tree refactor (40 modified files)
- Audit deleted migrations (021, 024, 025) — restore or confirm safe removal
- Add tests to 5 highest-risk untested modules: risk, execution, billing, auth, middleware
- Freeze all new feature work
- **Gate**: All 2,214 tests pass, no migration regressions

### Phase 2 — Extract Shared Kernel (Week 3-4)
- Move `types/`, `config/`, `db/`, `utils/`, `logger/`, `validation/` into `src/shared/`
- Strip any business logic found in shared modules
- Update all imports (automated via script)
- **Gate**: Full test suite passes, `tsc --noEmit` clean

### Phase 3 — Split Desk & Platform (Week 5-8)
- Create `src/desk/` and `src/platform/`
- Move modules per boundary map above
- Add `tenantId` columns where missing in platform tables
- Wire tier-gating middleware on all platform API routes
- Desk CLI remains operational throughout
- **Gate**: Desk CLI commands work, platform API responds, all tests pass

### Phase 4 — Clean Up & Document (Week 9-10)
- Refactor 20+ copy-paste Polymarket strategies into base class + config
- Split files >200 lines: audit service, referral repo, marketplace routes, xai routes
- Delete dead code identified during migration
- Write ADRs for boundary decisions
- Update roadmap, manifesto (add footnote acknowledging platform), changelog
- **Gate**: Zero files >200 lines in desk/ and platform/, all docs updated

---

## What Gets Cut/Deferred

| Item | Disposition | Why |
|------|-------------|-----|
| Phase 34: Content Personalization & A/B Testing | DEFER to post-separation | Needs stable platform boundary |
| PROJECT.md A/B framework (4 milestones) | DEFER | Dependent on platform boundary |
| Phase 35: Compliance & Security Hardening | KEEP — platform side | Tenant audit logging, encryption, rate limiting belong in platform |
| Phase 36: Marketplace & Multi-Tenant | KEEP — platform side | Core RaaS monetization |
| Phase 37: Advanced Risk Management | KEEP — desk side | Kelly, VaR, CVaR are proprietary desk concerns |
| Comment system with LLM moderation (Phase 34) | CUT | YAGNI — no subscriber demand yet |
| KYC/AML integration (Phase 35) | DEFER | Complex compliance; wait for revenue signal |

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|-----------|
| Import breakage during separation | High | High | Script import rewrites; `tsc --noEmit` after each module move |
| Test failures from moved files | Medium | Medium | Full suite after each phase; fix before proceeding |
| Breaking manifesto narrative | Low | Medium | Keep `docs/manifesto.md` as-is; add `docs/platform-doctrine.md` |
| Losing momentum during cleanup | Medium | Low | 10-week timeline, weekly milestones, build-in-public updates |
| Data loss from deleted migrations | High | Low | Audit before deletion; restore if any references remain |
| Circular dependency desk↔platform | Medium | Medium | Shared kernel prevents this; automated cycle detection in CI |

---

## Success Metrics

| Metric | Current | Target | When |
|--------|---------|--------|------|
| Tests passing | 2,214 | 2,214+ (no regression) | Every phase gate |
| Untested modules | 30 | ≤10 | Phase 4 |
| Files >200 lines | 22+ | 0 in desk/ and platform/ | Phase 4 |
| TypeScript errors | 0 | 0 | Every phase gate |
| Desk CLI operational | Working | Working throughout | Continuous |
| Platform API operational | Working | Working throughout | Continuous |
| Copy-paste strategy lines | ~9,000 | ~2,000 (base class) | Phase 4 |

---

## Next Steps

1. `/ck:plan` with this report as context to create detailed implementation phases
2. Complete working tree refactor before starting separation
3. Audit deleted migrations immediately (Phase 1 priority)

---

## Unresolved Questions

- Should `messaging/` (NATS + BullMQ) live in shared (both sides use it) or platform (primarily subscriber event routing)?
- Do deleted migrations 021, 024, 025 have any production data dependencies?
- Is the `ironclaw/` module active or dead code?
- Should the dashboard (`dashboard/`) be split into operator dashboard (desk) and subscriber dashboard (platform)?
