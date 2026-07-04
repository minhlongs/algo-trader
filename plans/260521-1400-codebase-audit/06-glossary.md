# Glossary — Internal Terms

| Term | Meaning |
|------|---------|
| **algo-trader** | Package name (`@mekong/algo-trader` v1.1.0). Primary CLI bin. |
| **CashClaw** | Public brand name. Second CLI bin (`cashclaw`). Public-facing site `cashclaw.cc`. |
| **RaaS** | Revenue-as-a-Service — the tier-gated SaaS wrapper around the trading engine. |
| **AlphaEar** | Python FastAPI sidecar on `:8100` providing Kronos forecasts + FinBERT sentiment + news. launchd plist `com.cashclaw.alphaear.plist`. |
| **Kronos** | Foundation time-series forecasting model. Three sizes: mini 4.1M / small 24.7M / base 102.3M params. Runs on MPS (Metal) or CPU. |
| **GRU** | Deprecated TF.js gated-recurrent-unit strategy (`GruStrategy.ts`). Still in CLI as `gru` subcommand but not in active registry. |
| **Nemotron-3 Nano** | NVIDIA fast-triage LLM at `:11436` (MLX 4-bit). Used by AlphaEar for first-pass triage. |
| **DeepSeek R1** | Reasoning LLM at `:11435`. Heavier path. |
| **Qwen3-30B** | Long-context LLM at `:11437`. Signal-hunting daemon model. |
| **AgentDispatcher** | Internal router that selects which LLM/agent to call. (Inferred from architecture; concrete file TBD.) |
| **TradingPipeline** | Composition of `kelly + drawdown + twap + wallet + audit` from `src/trading-pipeline.ts`. |
| **Drawdown tier** | Six-state machine: `NORMAL → ALERT → REDUCE → HALT → HARD_STOP → DAILY_PAUSE`. |
| **TWAP** | Time-Weighted Average Price executor. Chunks orders > `twapThresholdUsd` over time. PM2 `kill_timeout=180s` accommodates drain. |
| **Quarter-Kelly** | Position sizing at 25% of Kelly criterion, with hard 5% max-position cap. |
| **Immutable trade audit** | Append-only JSONL at `~/.cashclaw/trades.jsonl`. Single orchestration point via `pipeline.recordTradeOutcome()`. |
| **Tier (RaaS)** | FREE / PRO / ENTERPRISE. Tier ladder controls daily quota + feature flags. |
| **Feature flag** | `signals.crossmarket`, `signals.deltaneutral`, `intelligence.semantic`, `intelligence.swarm`, `analytics.advanced`, `execution.multileg`, `vibe.controller`. Managed in `middleware/feature-gate.ts`. |
| **License key** | `raas-{tier}-XXXX-XXXX` format. Issued on payment success. Aliases: `rpp-*` (PRO), `rep-*` (ENTERPRISE). |
| **Dunning** | Failed-payment retry workflow: 3 retries + 7-day grace → suspend license. Daily 02:00 cron `dunning-kv-sync.ts`. |
| **NOWPayments** | Active crypto payment processor (USDT TRC20). HMAC-SHA512 IPN signatures. |
| **NATS JetStream** | Primary message bus on `:4222` with persistence. Token-authenticated. |
| **Redis fallback bus** | When `NATS_URL` unset, message bus factory falls back to Redis pub/sub with same topic schema. |
| **CLOB** | Polymarket Central Limit Order Book. v1 (5.8.0) and v2 (0.2.6) both in deps. |
| **Gamma API** | Polymarket REST API for market metadata + whale activity. Polled at 30s by `whale-activity-feed.ts`. |
| **Split-merge arbitrage** | Buy YES + NO at sum < 0.98, merge into $1.00. Polymarket binary-market only. |
| **Neg-risk arbitrage** | Multi-outcome event where Σ(prices) ≠ 1.0 → guaranteed profit direction. |
| **ILP** | Integer Linear Programming — used for multi-leg basket arbitrage in `cross-market-arbitrage-detector.ts`. |
| **Frank-Wolfe** | Convex optimizer used in `src/optimization/` for multi-leg portfolio sizing. |
| **Whale activity** | Polymarket trades ≥ $1000 USDC (hardcoded threshold) polled from Gamma API. |
| **Qwen kill switch** | Env vars `QWEN_KILL` (block ingest), `QWEN_SIGNAL_KILL` (daemon stop), `QWEN_DRAWDOWN_MAX_PCT=5` (auto-disable on loss), `QWEN_AUTO_APPROVE_MAX_USD=500`. |
| **HMAC ingest** | Qwen daemon signs outgoing signals with `QWEN_INGEST_HMAC_SECRET` before posting to backend. |
| **paper-trades.json** | Local file at `data/paper-trades.json` holding cashclaw CLI paper-trading history. |
| **Wallet label** | String tag distinguishing multiple wallet contexts (live vs paper vs subscriber-X). |
| **STATS_DB** | Cloudflare D1 binding (id `472e48f7-…`) — read-only mirror of M1 Max `paper_trades_v3`. |
| **CACHE** | Cloudflare KV namespace (id `6c7199c0…`) — shared by Worker + Pages for edge cache + auth + tenant config. |
| **VPS_ORIGIN** | Worker env: if set, proxy `/api/*` to this backend; if unset, Worker is auth-only standalone. |
| **Phase 10 Cosmic** | `src/arbitrage/phase10_cosmic/` — DAO governance experimental module. `governance-proposer.ts` index is empty → STUB. |
| **Sprint 62** | Modularization sprint mentioned in `src/dashboard/` git history (split 295-LOC route file into four sub-200-LOC files). |
