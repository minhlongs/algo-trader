# Subsystem — Feeds, Venues, Arbitrage, Messaging

**Overview.** Real-time price/depth ingest from 8+ venues (CEX + Polymarket + prediction markets) plus 35-file arbitrage engine and a NATS-or-Redis event bus. Strategies (48 in registry) subscribe to bus topics and emit signals back to it.

**Entry points.**
- `src/feeds/feed-aggregator.ts` — aggregates all 15 active feeds → NATS topics
- `src/feeds/websocket-client.ts` — `BaseWebSocketClient` for Binance/OKX/Bybit
- `src/polymarket/clob-client.ts` (v1 5.8.0) + `clob-v2-adapter.ts` (v2 0.2.6) — dual CLOB clients
- `src/arbitrage/cross-market-arbitrage-detector.ts` — ILP-based multi-leg
- `src/arbitrage/split-merge-arb-executor.ts` — binary mathematical arb (YES+NO < 0.98)
- `src/arbitrage/neg-risk-arb-scanner.ts` — multi-outcome ≠ 1.0 detector
- `src/arbitrage/scanner.ts` — CEX cross-exchange (creds optional, read-only fallback)
- `src/messaging/create-message-bus.ts` — factory (NATS || Redis || in-mem)
- `src/wiring/strategy-wiring.ts:72-101` — strategy registry (data-driven config)

**Active venues.**
| Venue | Adapter | Protocol | Notes |
|-------|---------|----------|-------|
| Polymarket | `polymarket-websocket-feed.ts`, `clob-client.ts`, `clob-v2-adapter.ts` | WSS + REST | Dual CLOB versions live |
| Binance | `binance-ws.ts` | WSS | `wss://stream.binance.com:9443/ws` |
| OKX | `okx-ws.ts` | WSS v5 | |
| Bybit | `bybit-ws.ts` | WSS v5 | |
| Kalshi | `kalshi-price-feed.ts` | REST poll | `api.elections.kalshi.com/trade-api/v2` |
| Limitless | `limitless-price-feed.ts` | REST poll | `api.limitless.exchange/v1` |
| PredictIt | `predictit-price-feed.ts` | REST poll | `predictit.org/api/marketdata/all/` |
| Smarkets | `smarkets-price-feed.ts` | REST poll | `api.smarkets.com/v3` |
| Polymarket Gamma | `whale-activity-feed.ts` | REST poll 30s | Whale trades ≥$1000 USDC (hardcoded) |
| News / sentiment | `news-impact-analyzer.ts`, `news-market-correlator.ts` | NLP + Ollama | |

**Dead/legacy.**
- `polymarket-ws-feed.ts` — duplicate of `polymarket-websocket-feed.ts`
- `GruStrategy.ts` — deprecated, not in registry
- `phase10_cosmic/daoGovernance/` — stub (governance-proposer index empty)

**NATS topic schema** (`src/messaging/topic-schema.ts`):
```
market.{venue}.update
signal.simple-arb.detected
signal.cross-market.candidate
signal.crossmarket.candidate
signal.cross-platform.candidate
signal.delta-neutral.candidate
signal.multi-leg.optimized
signal.validated
intelligence.ilp.evolution
intelligence.dependencies.updated
order.placed | filled | cancelled | failed
risk.alert
risk.circuit-breaker.triggered
system.health | system.metrics
```

**Arbitrage clusters.**
1. **Cross-market ILP** — integer programming multi-leg basket optimization
2. **Split-merge** — YES + NO @ sum < 0.98, merge for $1.00 (Polymarket binary only)
3. **Neg-risk** — multi-outcome where sum(YES) ≠ 1.0
4. **Regime/signal scoring** — bull/bear/neutral + signal quality filter
5. **Spread detection** — YES/NO narrowing/widening
6. **CEX cross-exchange** — Binance/Coinbase/Kraken via CCXT (creds optional)
7. **Execution + compliance** — order submission + compliance rules
8. **DAO governance (Phase 10 Cosmic)** — STUB

**Resilience.**
- Every REST feed wrapped in `resilient-fetch.ts` (circuit breaker + retry + backoff)
- Polymarket WS reconnect with exponential backoff (`recovery-manager.ts`)
- Strategy state checkpointed to Redis (`strategy-state-store.ts`)

**Notifications & Telegram.**
- SendGrid email (`SENDGRID_API_KEY`)
- Twilio SMS (`TWILIO_*`)
- Telegram bot via `grammy` 1.33.0: `/start /help /status /link /unlink /balance /positions /pnl /notifications /limits /faq /pricing /support`

**Risks.**
1. **Dual CLOB v1+v2 in production** — unclear ownership, code paths drift. MEDIUM.
2. **Whale threshold hardcoded** $1000 USDC — should be config. LOW.
3. **No unified backtest orchestrator** — 35 arb + 48 strategies, individual harnesses. MEDIUM.
4. **Redis vs NATS fallback order undocumented** at startup time. LOW.
5. **CEX creds optional** — graceful fallback to read-only; unclear if any cross-CEX arb is actually live. MEDIUM.

**Missing docs.**
- Topic schema → strategy consumer map.
- CLOB v1 vs v2 selection logic.
- Backtest harness inventory.

**Confidence: HIGH.**
