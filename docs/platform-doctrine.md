# Platform Doctrine — RaaS Subscriber Infrastructure

> Governs `src/platform/`. The solo desk follows its own doctrine in `docs/manifesto.md`.

## Identity

The platform is a **Robot-as-a-Service (RaaS)** subscriber infrastructure. It lets paying subscribers access algorithmic trading strategies without running their own infrastructure. The platform handles auth, billing, tenant isolation, tier gating, and marketplace discovery.

## Tenants & Tiers

Three subscription tiers with escalating capabilities:

| Tier | Access | Key Features |
|------|--------|-------------|
| **FREE** | Read-only browsing | Signal viewing, marketplace browsing, basic analytics |
| **PRO** | Strategy execution | Backtesting, signal feeds, AI audit, strategy publishing |
| **ENTERPRISE** | Full platform control | Admin, revenue analytics, audit logs, license management |

See `src/platform/middleware/feature-gate.ts` for implementation. See ADR 002 for design rationale.

## Architecture Principles

1. **Every route is tier-gated.** No endpoint is public — missing license = 401, insufficient tier = 403.
2. **Every query is tenant-scoped.** `buildTenantFilter(tenantId)` on all platform DB access. See ADR 003.
3. **Auth is layered.** Subscriber auth (license token) → Tier gate (`requireTier`) → Tenant filter. Admin routes use separate `X-Admin-Key` header auth.
4. **Desk strategies are imported, not copied.** Platform imports desk strategies through the shared `IStrategy` interface and wraps them with tenant context. See ADR 004.
5. **No operator credentials in platform.** All third-party keys (API, payment, exchange) come from customer BYOK setup, never from platform config.

## Module Map

| Module | Path | Responsibility |
|--------|------|---------------|
| API Gateway | `platform/api/` | Express REST + WebSocket, 31 route files |
| Auth | `platform/auth/` | Better Auth multi-tenant sessions |
| Billing | `platform/billing/` | NOWPayments, invoices, subscriptions, dunning |
| Marketplace | `platform/marketplace/` | Strategy listings, subscriptions, reviews, disputes, vetting |
| RaaS Executor | `platform/raas/` | Sandboxed strategy execution per tenant |
| Metering | `platform/metering/` | Usage tracking with threshold alerts |
| Middleware | `platform/middleware/` | Tier gating, rate limiting, metrics, error handling |
| Audit | `platform/audit/` | Immutable trade audit, AI decision tracking |
| Referral | `platform/referral/` | Referral program, commissions, payouts |
| Workers | `platform/workers/` | Cloudflare edge proxy worker |
| Telegram | `platform/telegram/` | Bot integration for subscriber alerts |
| Notifications | `platform/notifications/` | Email, dunning notices |

## Import Rules

```
platform/ → shared/ (always allowed)
platform/ → desk/   (for strategy orchestration via IStrategy)
platform/ → platform/ (internal imports)

desk/ → platform/   (FORBIDDEN — desk is tenant-free)
shared/ → desk/     (FORBIDDEN — shared has no business logic)
shared/ → platform/ (FORBIDDEN)
```

## Key Files

| File | Purpose |
|------|---------|
| `middleware/feature-gate.ts` | `requireTier()` Express middleware |
| `middleware/license-validation.ts` | Fastify license validation plugin |
| `middleware/raas-gate.ts` | License injection + tier resolution |
| `api/server.ts` | Express + WebSocket gateway, route registration |
| `audit/audit-log-service.ts` | Central audit logging |
| `billing/subscription-service.ts` | Subscription lifecycle management |

## Quality Gates

- All 103+ API endpoints tier-gated
- `buildTenantFilter()` on every DB query touching tenant data
- Zod validation on all API inputs
- `npm test` must pass (2,366 tests)
- `npm run build` must pass (0 TypeScript errors)
- Zero `:any` in production code
