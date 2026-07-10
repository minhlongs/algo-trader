---
title: Phase A Billing Polish + Phase B MCP Server
status: pending
priority: P1
effort: medium
branch: main
tags: [billing, mcp, signals, cleanup]
created: 2026-07-08
---

# Phase A Billing Polish + Phase B MCP Server

**Plan:** 260708-2000 | **Mode:** --tdd | **Brainstorm:** `plans/reports/260708-2000-billing-polish-mcp-brainstorm-report.md`

## Phases

| Phase | File | Status | Dependencies |
|-------|------|--------|--------------|
| A | `phase-a-billing-polish.md` | pending | — |
| B | `phase-b-mcp-server.md` | pending | Phase A |

## Acceptance Criteria

- `npx vitest run` passes (1340+ tests) after each phase
- `/api/v1/signals/usage/:subscriberId` returns real data (already wired ✓)
- Zero dead `signNOWPayments`/`verifyNOWPayments` functions in `payment-service.ts`
- Zero dead `NOWPAYMENTS_INVOICE_MASTER`/`NOWPAYMENTS_INVOICE_SIGNALS_*` env vars in `.env.example`
- Telegram `/link` persists user sessions across restarts (D1-backed ✓)
- MCP agent connects via `@modelcontextprotocol/sdk`, calls `get_signals`, receives tier-filtered results
- No breaking changes to existing API paths

## Key Dependencies

- `src/platform/billing/payment-service.ts` — dead function removal target
- `src/platform/middleware/signal-tier-resolver.ts` — tier extraction for MCP auth
- `src/desk/signal/signal-tier-filter.ts` — tier-based signal filtering
- `src/desk/signal/signal-rest-cache.ts` — cache layer for feed
- `src/platform/signal/signal-subscriber-repository-d1.ts` — subscriber lookup for MCP
- `@modelcontextprotocol/sdk` — external dep, to be installed in Phase B
