# Phase 04 — CEX Adapter (Binance + dYdX, Lift Polymarket-Only)

**File ownership:** `src/markets/cex/**`, `src/execution/cex-order-router.ts`, `src/execution/cex-position-reconciler.ts`, `src/db/migrations/013_cex_*.sql`

## Context Links

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md`
- Scout reuse: `plans/reports/scout-260416-2312-raas-reuse-surface.md` (BUILD-NEW #4)
- Existing: `src/execution/polymarket-adapter.ts`, `src/execution/order-executor.ts`, `src/execution/order-validator.ts`

## Overview

- Priority: P2
- Status: pending
- Brief: Add centralized-exchange adapters (Binance spot + dYdX perp) parallel to existing Polymarket adapter. MVP = read market data + place/cancel spot orders. Perp/leverage deferred.

## Key Insights

- Polymarket adapter = CLOB on-chain; Binance/dYdX = off-chain REST+WS — different primitives
- Reuse `order-validator.ts` pre-flight checks (funds, slippage)
- Reuse `rollback-handler.ts` pattern for failed orders
- DO NOT reuse `polymarket-signer.ts` (chain-specific); each CEX has own HMAC/signing

## Requirements

**Functional:**
- Binance REST: `GET /ticker`, `POST /order`, `DELETE /order`, WS `@depth` stream
- dYdX v4: spot + perp read-only MVP; order placement stubbed (gate behind flag)
- Unified `Market` + `Order` types across Polymarket/Binance/dYdX
- Subscriber BYOK: API key pulled from Phase 01 custody on each call
- Rate limiting per exchange (Binance 1200 weight/min)

**Non-functional:**
- Order placement < 300ms P95
- WS reconnect on disconnect within 5s
- No hardcoded secrets

## Architecture

```
strategy signal ──> cex-order-router ──┬──> binance-spot-adapter ──> REST
                                        ├──> dydx-v4-adapter ──────> REST
                                        └──> polymarket (existing)
                                        all go through ironclaw-fetch-proxy
```

## Related Code Files

**Create:**
- `src/markets/cex/binance-spot-adapter.ts` (~180 LOC)
- `src/markets/cex/binance-websocket-client.ts` (~150 LOC)
- `src/markets/cex/binance-signer.ts` (~100 LOC)
- `src/markets/cex/dydx-v4-adapter.ts` (~180 LOC)
- `src/markets/cex/dydx-signer.ts` (~100 LOC)
- `src/markets/cex/cex-rate-limiter.ts` (~120 LOC)
- `src/markets/cex/unified-market-types.ts` (~80 LOC)
- `src/markets/cex/cex-health-monitor.ts` (~100 LOC)
- `src/markets/cex/index.ts` (~40 LOC barrel)
- `src/execution/cex-order-router.ts` (~180 LOC)
- `src/execution/cex-position-reconciler.ts` (~150 LOC)
- `src/markets/cex/__tests__/binance-spot-adapter.test.ts`
- `src/markets/cex/__tests__/dydx-v4-adapter.test.ts`
- `src/markets/cex/__tests__/cex-rate-limiter.test.ts`
- `src/db/migrations/013_cex_orders.sql`

**Modify:**
- `src/execution/order-executor.ts` — dispatch by `market.venue` to polymarket vs cex router

## Implementation Steps

1. Migration `013_cex_orders.sql` (unified `orders` extension: venue, external_id, exchange_ts)
2. Define `unified-market-types.ts` (Market, Order, Fill, Ticker interfaces)
3. Build `binance-signer.ts` (HMAC-SHA256 of query string)
4. Build `binance-spot-adapter.ts` (REST client: ticker, place, cancel)
5. Build `binance-websocket-client.ts` (depth stream + reconnect)
6. Build `cex-rate-limiter.ts` (token bucket, weight-aware)
7. Build `dydx-signer.ts` (STARK key signing)
8. Build `dydx-v4-adapter.ts` (read-only + stubbed order)
9. Build `cex-order-router.ts` (route by venue)
10. Build `cex-position-reconciler.ts` (poll balances vs ledger)
11. Build `cex-health-monitor.ts` (heartbeat + WS alive check)
12. Modify `order-executor.ts` to dispatch via router
13. Integration test: Binance testnet place + cancel cycle
14. Integration test: dYdX indexer read

## Todo List

- [ ] Migration 013 applied
- [ ] `unified-market-types.ts`
- [ ] `binance-signer.ts` + test (fixture vectors)
- [ ] `binance-spot-adapter.ts` + test
- [ ] `binance-websocket-client.ts` + test (reconnect)
- [ ] `cex-rate-limiter.ts` + test
- [ ] `dydx-signer.ts` + test
- [ ] `dydx-v4-adapter.ts` + test
- [ ] `cex-order-router.ts` + test
- [ ] `cex-position-reconciler.ts` + test
- [ ] `cex-health-monitor.ts` + test
- [ ] `order-executor.ts` dispatch patch
- [ ] Binance testnet round-trip verified

## Success Criteria

- `bun test src/markets/cex` green
- Binance testnet: place spot order → filled → reconciled in ledger
- dYdX v4: read ticker + order book
- All outbound flows through Phase 03 IronClaw proxy (verified via audit log)
- No `any` / `@ts-ignore`

## Risk Assessment

- **R1:** Binance API key rotation — already handled by Phase 01 BYOK custody
- **R2:** dYdX v4 SDK churn (Cosmos-based) → pin SDK version; consider REST-only initially
- **R3:** Perpetual funding risk → perp trading OFF in MVP (spot only)
- **R4:** Cross-exchange arbitrage latency — not MVP concern

## Security Considerations

- All API calls routed via IronClaw (Phase 03) for egress control
- BYOK keys unwrapped just-in-time, zeroed after request
- Rate limiter prevents key ban → auto-lockout

## Next Steps

- Phase 06 subscriber P&L consumes CEX fills alongside Polymarket fills
- Post-MVP: perps, margin, cross-exchange hedge strategies
