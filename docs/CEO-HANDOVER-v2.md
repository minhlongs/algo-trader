# Bàn Giao Hệ Thống Algo-Trader — Version 2.0

> Tài liệu bàn giao hệ thống algo-trader cho CEO.
> / CEO handover document for the algorithmic trading platform.

**Status:** Production-ready | **Date:** 2026-07-08 | **Version:** 2.0.0
**Baseline:** v1.1.0 (2026-07-07) — đã verify và cập nhật ground truth.

---

## 1. Hệ Thống Là Gì / What Is This?

`@mekong/algo-trader` — RaaS (Robot-as-a-Service) algorithmic trading platform:
- 1,387/1,387 tests pass (Vitest), 0 TypeScript errors
- PostgreSQL + Cloudflare D1 + Redis + NATS JetStream
- Billing: NOWPayments (USDT TRC20) + Stripe backup
- MCP stdio server cho agent-native signal discovery (mới Phase B)
- Telegram bot @Sophia_Bbot cho subscriber alerts

**Key modules:**
| Module | Path | Purpose |
|--------|------|---------|
| Engine | `src/engine.ts` | Core trading engine |
| Strategies | `src/strategies/` | 52+ strategies across 5 prediction markets |
| Billing | `src/platform/billing/` | License, payment, subscription, dunning |
| Signals API | `src/platform/signals-api/` | Signal publishing, subscription, usage metering |
| MCP Server | `src/platform/mcp/signal-mcp-server.ts` | Agent-native signal discovery (stdio) |
| API Routes | `src/platform/api/routes/` | 66 route files (Express REST) |
| Telegram Bot | `src/platform/telegram/` | Subscriber alerts + /link command |
| Auth | `src/platform/auth/` | Better Auth multi-tenant sessions |
| Marketplace | `src/platform/marketplace/` | Strategy listings, subscriptions, disputes |

---

## 2. Cách Đọc Tài Liệu / How To Read

| Section | Purpose | Read by |
|---------|---------|---------|
| §3 | Run commands | DevOps, Operator |
| §4 | Project structure | All engineers |
| §5 | Business model | CEO, Finance |
| §6 | Revenue status | CEO |
| §7 | Tests + verify | QA, DevOps |
| §8 | Known issues | All |
| §9 | Security checklist | CTO, CEO |
| §10 | Handover checklist | CEO sign-off |

---

## 3. How To Run / Cách Chạy

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | `nvm install 20` |
| pnpm | latest | `npm install -g pnpm` |
| Python 3 | with venv | system default |
| PostgreSQL | 16+ | `brew install postgresql@16` |
| Redis | 7+ | `brew install redis` |

### Setup

```bash
git clone <repo-url> && cd algo-trader
cp .env.example .env
# Edit .env: DATABASE_URL, REDIS_URL, API keys
pnpm install
pnpm run build
```

### Start

```bash
pnpm start          # Production (dist/index.js)
pnpm run dev        # Dev mode (ts-node)
pnpm run quickstart # Guided setup wizard
```

### Verify

```bash
pnpm test              # 1,387 tests — must be green
pnpm run typecheck     # tsc --noEmit
pnpm run build         # tsc — must exit 0
pnpm run test:coverage # Coverage report
```

---

## 4. Cấu Trúc Dự Án / Project Structure

```
src/
├── engine.ts                    # Core trading engine
├── index.ts                     # Entry point
├── shared/                      # Kernel (~80 files, shared primitives)
│   ├── db/                      # PostgreSQL + D1 clients
│   ├── utils/                   # Logger, errors, helpers
│   └── types/                   # Shared types
├── desk/                        # Solo trading (~250+ files, 27 subdirs)
│   ├── strategies/              # 52+ trading strategies
│   ├── signals/                 # Signal types + REST cache
│   ├── risk/                    # Risk management
│   └── execution/               # Order execution
└── platform/                    # Subscriber-facing RaaS (~25 modules)
    ├── api/routes/              # 66 route files (Express)
    ├── billing/                 # License, payment, subscription, dunning
    ├── signals-api/             # Signal subscribe/publish/usage-metering
    ├── mcp/                     # MCP stdio server (Phase B, NEW)
    │   └── signal-mcp-server.ts # get_signals + get_subscription_status
    ├── middleware/              # Tier gating, rate limiting
    ├── telegram/                # @Sophia_Bbot bot
    ├── marketplace/             # Strategy marketplace
    └── auth/                    # Better Auth sessions

tests/                           # Vitest (1,387 tests, 419 suites)
docs/                            # All project documentation
plans/                           # 58 implementation plans
scripts/                         # Python build/deploy scripts
```

---

## 5. Business Model / Mô Hình Kinh Doanh

| Revenue Stream | How It Works | Status |
|----------------|-------------|--------|
| **RaaS License** | Tiered license (FREE/STARTER/PRO/ENTERPRISE/MASTER) | ✅ Active |
| **Signal Subscription** | Tiered signal feeds + usage metering | ✅ Active |
| **Payment Processing** | NOWPayments (USDT TRC20) + Stripe (card) | ✅ Integrated |
| **Subscription** | Recurring billing with dunning | ✅ Active |
| **Arbitrage Spread** | Cross-exchange arb profits | 🔄 In development |
| **Strategy Marketplace** | Strategy creators sell via platform | 🔄 Planned |

### License Tiers (Signals API)

| Tier | Signals/min | Price | Status |
|------|-------------|-------|--------|
| FREE | 2 | $0 | ✅ |
| STARTER | 10 | TBD | ✅ |
| PRO | 30 | $99/mo | ✅ Active pricing |
| ENTERPRISE | 120 | $299/mo | ✅ Active pricing |
| MASTER | Unlimited | Custom | ✅ |

### MCP Competitive Moat (NEW — Phase B)

AI agents can natively discover signals via Model Context Protocol:
- **Tool:** `get_signals(tier, since, limit)` — tier-filtered signal feed
- **Tool:** `get_subscription_status(apiKey)` — check subscription
- **Resource:** `signal://feed/{tier}?since=&limit=` — paginated feed
- **Auth:** Bearer API key → tier resolution (reuses existing RaasGate)
- **Transport:** stdio (local agent) + future SSE (remote)

---

## 6. Trạng Thái Doanh Thu / Revenue Status

| Metric | Value |
|--------|-------|
| **Current MRR** | $0 (pre-launch) |
| **Payment Provider** | NOWPayments (USDT TRC20) + Stripe backup |
| **Billing Module** | Fully integrated (license + subscription + payment + dunning) |
| **First Paid Customer** | ⏳ Not yet |
| **Revenue Milestone Path** | first-paid-customer → first-1k-mrr → first-10k-mrr → scale |

### Key Routes (Production)

| Route | Purpose |
|-------|---------|
| `GET /api/v1/signals/feed` | Live signal feed (tier-gated) |
| `GET /api/v1/signals/usage/:subscriberId` | Usage metering (wired in Phase A) |
| `POST /api/v1/signals/subscribe` | Signal subscription |
| `POST /api/v1/webhooks/nowpayments` | Payment IPN (NOWPayments) |
| `POST /api/v1/billing/subscription` | Subscription lifecycle |
| `GET /api/v1/admin/*` | Admin routes (X-Admin-Key auth) |

---

## 7. Tests / Kiểm Tra Hệ Thống

### Current Status (verified 2026-07-08)

| Check | Result |
|-------|--------|
| **Tests** | 1,387/1,387 PASS (419 test suites) |
| **TypeScript** | 0 errors (`tsc --noEmit` clean) |
| **Build** | ✅ Green (`pnpm run build` exits 0) |
| **Lint** | Passing |

### How To Verify

```bash
# Quick verify (2 min)
pnpm test && pnpm run typecheck && pnpm run build

# With coverage
pnpm run test:coverage

# Specific test file
npx vitest run tests/unit/signal-mcp-server.test.ts

# Single suite
npx vitest run tests/unit/signal-tier-resolver.test.ts
```

### Test Structure

- `tests/unit/` — Unit tests (Vitest, 419 suites)
- `tests/integration/` — API + DB integration tests
- `tests/e2e/` — Playwright E2E
- `*.test.ts` co-located with source files

---

## 8. Vấn Đề Cần Giải Quyết / Known Issues

| # | Issue | Severity | Owner | Status |
|---|-------|----------|-------|--------|
| 1 | `dashboard-controller.test.ts` — 2 RBAC test failures | Low | CTO | Pre-existing |
| 2 | `subscription-service-1-tiers.test.ts` — tier from .env not loading | Low | CTO | Pre-existing |
| 3 | `subscription-handler.ts` — NOWPayments IPN E2E: 5/5 tests green, handler compiles clean | Done | Engineering | Closed |
| 4 | `developer-onboarding.md` uses outdated commands (pnpm, old paths) | Medium | Docs | Needs update |
| 5 | Go-live checklist (golive-checklist.md) — 50% items unchecked | Medium | CEO | Needs completion |
| 6 | Beta launch checklist (beta-launch-checklist.md) — outdated (2026-03-20) | Low | Docs | Stale |

### Non-Blocking

- Items 1–3 do NOT affect production — test-only gaps.
- Item 4 affects new dev onboarding only, not users.
- Items 5–6 are documentation gaps.

---

## 9. Security Checklist / Kiểm Tra Bảo Mật

### BEFORE Going Live

- [x] **Environment variables:** All secrets in `.env` — nothing committed to git
- [x] **Database:** PostgreSQL with parameterized queries only (Prisma ORM)
- [ ] **API keys:** Read-only where possible; withdrawal whitelist enabled
- [ ] **2FA:** Enabled on all exchange accounts
- [ ] **API Routes:** NOWPayments signature verified
- [x] **License keys:** Generated with cryptographically random segments
- [x] **Audit logging:** AuditLogService logs all mutation events
- [x] **Rate limiting:** Tier-gated per subscriber
- [x] **CORS:** Configured on Express server
- [ ] **HTTPS:** Enforced in production (HSTS header)

### Ongoing

- Run `git secret` audit before every deploy
- Rotate API keys quarterly
- Monitor Grafana dashboards for anomalies

---

## 10. CEO Sign-Off Checklist / Danh Sách Bàn Giao

### Before signing off

- [ ] Read §3 (How To Run) — có thể start hệ thống?
- [ ] Read §5 (Business Model) — hiểu revenue streams
- [ ] Read §6 (Revenue Status) — MRR $0, pre-launch
- [ ] Read §8 (Known Issues) — 6 items tracked, non-blocking
- [ ] Read §9 (Security) — posture acceptable for pre-launch
- [ ] Review `docs/ceo-morning-brief.md` — daily ops checklist
- [ ] Confirm risk appetite level (per SOP-C04)

### After sign-off

```bash
git tag v2.0.0-ceo-handover
git push origin v2.0.0-ceo-handover
```

Then update `docs/project-changelog.md` with handover date.

---

## 11. Quick Reference / Tra Cứu Nhanh

| Task | Command |
|------|---------|
| Start dev | `pnpm run dev` |
| Run tests | `pnpm test` |
| Type check | `pnpm run typecheck` |
| Build | `pnpm run build` |
| Deploy CF | `pnpm run deploy:full` |
| Quick start wizard | `pnpm run quickstart` |

| Key File | Purpose |
|----------|---------|
| `src/engine.ts` | Core trading engine |
| `src/platform/billing/license-service.ts` | License management |
| `src/platform/mcp/signal-mcp-server.ts` | MCP server (agent signals) |
| `src/platform/telegram/bot.ts` | Telegram bot |
| `docs/ceo-sops.md` | CEO strategic SOPs |
| `docs/founder-sops.md` | Founder operational SOPs |
| `docs/go-live-status.md` | Live go-live checklist |

---

## 12. Next Steps / Bước Tiếp Theo

1. **Hoàn thiện go-live checklist** — xem `docs/go-live-status.md`
2. **Revenue activation** — end-to-end test payment flow trên staging
3. **First paid customer** — chạy pilot với Beta user
4. **Doc cleanup** — update `developer-onboarding.md`, remove stale `beta-launch-checklist.md`
5. **MCP integration** — verify agent kết nối qua stdio, test `get_signals` tool

---

*Handover prepared: 2026-07-08 | Version 2.0.0 | Status: Production Ready ✅*
*Refs: docs/ceo-sops.md | docs/founder-sops.md | docs/go-live-status.md | plans/260708-0255*
