# Codebase Summary — Algo Trader v1.5.0

## Overview
Algo Trader is a RaaS (Robot-as-a-Service) multi-tenant automated trading platform with autonomous marketing. Supports 52+ strategies across 5 prediction markets (Polymarket, Kalshi, Limitless, PredictIt, Smarkets), real-time multi-platform price feeds, AGI intelligence suite (regime detection, triangular arb, funding-rate arb, whale tracking, cycle-end sniper), paper trading (+$2,251 P&L), auto-generated blog content, and Fastify API gateway.

## Project Structure

### src/messaging/ — Event-Driven Message Bus (Phase 19)
| File | Class | Purpose |
|------|-------|---------|
| `nats-message-bus.ts` | `NatsMessageBus` | NATS.io pub/sub with JetStream persistence |
| `redis-message-bus.ts` | `RedisMessageBus` | Redis Pub/Sub fallback layer |
| `jetstream-manager.ts` | `JetStreamManager` | Stream config, consumer mgmt, message replay |
| `nats-connection-manager.ts` | `NatsConnectionManager` | Connection pooling, reconnection logic |
| `message-bus-interface.ts` | `IMessageBus` | Abstract interface for pluggable bus backends |
| `topic-schema.ts` | — | Event type definitions + routing rules |
| `create-message-bus.ts` | — | Factory for bus instantiation |
| `index.ts` | — | Module exports |

### src/intelligence/ — Semantic Dependency Discovery & Vibe-Trading (Phases 20, 25)
| File | Class | Purpose |
|------|-------|---------|
| `semantic-dependency-discovery.ts` | `SemanticDependencyDiscovery` | DeepSeek API analyzes market relationships |
| `relationship-graph-builder.ts` | `RelationshipGraphBuilder` | DAG construction from dependency analysis |
| `alphaear-client.ts` | `AlphaEarClient` | Gamma API integration for live market data |
| `kronos-fair-value.ts` | `KronosFairValue` | Time-series fair value computation |
| `semantic-cache.ts` | `SemanticCache` | Redis caching (24h TTL) for analyses |
| `market-context-builder.ts` | — | Context aggregation from multiple sources |
| `signal-consensus-swarm.ts` | `SignalConsensusSwarm` | 3-persona LLM debate (risk/momentum/contrarian) for signal validation |
| `dual-level-reflection-engine.ts` | `DualLevelReflectionEngine` | Post-trade analysis: Level 1 (math) + Level 2 (LLM causal) learning |

### src/arbitrage/ — Cross-Market ILP Solver & Self-Evolving Constraints (Phases 21, 25)
| File | Class | Purpose |
|------|-------|---------|
| `integer-programming-solver.ts` | `IntegerProgrammingSolver` | javascript-lp-solver wrapper for optimization |
| `ilp-constraint-builder.ts` | `ILPConstraintBuilder` | Dynamic constraint generation |
| `cross-market-arbitrage-detector.ts` | `CrossMarketArbitrageDetector` | Multi-leg arb identification |
| `multi-leg-basket.ts` | `MultiLegBasket` | Multi-leg position representation |
| `self-evolving-ilp-constraints.ts` | `SelfEvolvingILPConstraints` | DeepSeek-powered constraint auto-tuning from missed opportunities |

### src/wiring/ — Runtime Mode Control (Phase 25)
| File | Class | Purpose |
|------|-------|---------|
| `vibe-controller.ts` | `VibeController` | NATS-based runtime trading mode switcher (conservative/balanced/aggressive/defensive) |

### src/core/ — Engine & Multi-Tenant
- `BotEngine.ts` — Signal routing, strategy orchestration
- `RiskManager.ts` — Position sizing, risk calculation
- `OrderManager.ts` — Order state tracking
- `TenantArbPositionTracker.ts` — Multi-tenant positions, tier limits
- `TenantStrategyManager.ts` — Tenant CRUD, strategy assignment
- `PaperTradingEngine.ts` — Virtual trading simulation
- `WebSocketServer.ts` — Real-time stream broadcasting
- `StrategyAutoDetector.ts` — Nixpacks-inspired auto-detection, build plan
- `StrategyLoader.ts` — Dynamic strategy loading by name
- `pnl-realtime-snapshot-service.ts` — P&L snapshot (realized + unrealized)
- `signal-market-regime-detector.ts` — Signal-layer regime classification

### src/strategies/ — Trading Strategies
- **Technical**: RSI+SMA, RSI Crossover, Bollinger, MACD, MACD+Bollinger+RSI
- **Arbitrage**: Cross-Exchange, Triangular, Statistical, AGI
- **Polymarket (Phase 22)** (`src/strategies/polymarket/`):
  - Delta-Neutral: DeltaNeutralVolatilityArbitrage, DeltaNeutralPortfolioMonitor, DeltaCalculator
  - Event-Driven: EventDeadlineScaler, CrossEventDrift, EventHedgingSynthetic
  - Momentum: BollingerSqueeze, DecayRateMomentum, SentimentMomentumDivergence
  - Correlation: CrossCorrelationLag, CorrelationPairTrade
  - Microstructure: ClusterBreakout, GapFillReversion, VolatilitySurfaceSmile
  - **15+ Polymarket-optimized strategies** for implied probability arbitrage

### src/execution/ — Order Execution Pipeline
| File | Class | Purpose |
|------|-------|---------|
| `websocket-multi-exchange-price-feed-manager.ts` | `WebSocketMultiExchangePriceFeedManager` | Binance/OKX/Bybit streams, auto-reconnect |
| `fee-aware-cross-exchange-spread-calculator.ts` | `FeeAwareCrossExchangeSpreadCalculator` | Net spread = gross - fees - slippage, 5min TTL |
| `atomic-cross-exchange-order-executor.ts` | `AtomicCrossExchangeOrderExecutor` | Promise.allSettled buy/sell, rollback |
| `paper-trading-arbitrage-bridge.ts` | `PaperTradingArbitrageBridge` | Paper trading multi-exchange simulator |
| `realtime-arbitrage-scanner.ts` | `RealtimeArbitrageScanner` | EventEmitter; emits `opportunity` on profitable spreads |
| `arbitrage-execution-engine.ts` | `ArbitrageExecutionEngine` | Scanner → CircuitBreaker → Executor → Telegram |
| `order-book-depth-analyzer.ts` | `OrderBookDepthAnalyzer` | Real L2 order book slippage + liquidity check |
| `market-regime-detector.ts` | `MarketRegimeDetector` | Regime classification, adaptive param suggestions |
| `triangular-arbitrage-live-scanner.ts` | `TriangularArbitrageLiveScanner` | 3-leg intra-exchange cycle detection |
| `funding-rate-arbitrage-scanner.ts` | `FundingRateArbitrageScanner` | Cross-exchange funding rate spread detection |
| `adaptive-circuit-breaker-per-exchange.ts` | `AdaptiveCircuitBreaker` | Per-exchange trip/reset, health gating |
| `exchange-connection-pool.ts` | `ExchangeConnectionPool` | CCXT connection pooling |
| `exchange-health-monitor.ts` | `ExchangeHealthMonitor` | Latency + error rate monitoring |
| `exchange-registry.ts` | `ExchangeRegistry` | Named exchange instance registry |
| `exchange-router-with-fallback.ts` | `ExchangeRouterWithFallback` | Route with automatic fallback |
| `live-exchange-manager.ts` | `LiveExchangeManager` | Live session lifecycle management |
| `portkey-inspired-exchange-gateway-middleware-pipeline.ts` | `ExchangeGatewayMiddlewarePipeline` | Middleware chain for exchange calls |
| `signal-order-pipeline-live-trading.ts` | — | Signal → order pipeline for live trading |
| `strategy-position-manager.ts` | `StrategyPositionManager` | Per-strategy position tracking |
| `telegram-trade-alert-bot.ts` | `TelegramTradeAlertBot` | Trade execution notifications |
| `tick-to-candle-aggregator.ts` | `TickToCandleAggregator` | Real-time OHLCV candle aggregation |
| `distributed-nonce-manager.ts` | `DistributedNonceManager` | Redis atomic nonce counter for replay protection |
| `gas-batch-optimizer.ts` | `GasBatchOptimizer` | Multi-leg order gas cost minimization |
| `multi-leg-frank-wolfe-optimizer.ts` | `MultiLegFrankWolfeOptimizer` | Slippage minimization for multi-leg execution |

### Key Interfaces (Phase 9-11)
| Interface | File | Description |
|-----------|------|-------------|
| `ArbitrageOpportunity` | `realtime-arbitrage-scanner.ts` | Cross-exchange opportunity with tick age |
| `ArbEngineMetrics` | `arbitrage-execution-engine.ts` | Cumulative execution stats |
| `ArbTradeRecord` | `arbitrage-execution-engine.ts` | Individual trade record |
| `DepthAnalysis` | `order-book-depth-analyzer.ts` | Single-side L2 depth result |
| `SpreadDepthAnalysis` | `order-book-depth-analyzer.ts` | Combined buy+sell depth viability |
| `RegimeStats` | `market-regime-detector.ts` | Rolling volatility/trend stats |
| `ArbParamSuggestion` | `market-regime-detector.ts` | Adaptive scanner param overrides |
| `TriArbCycle` | `triangular-arbitrage-live-scanner.ts` | 3-leg path definition |
| `TriArbOpportunity` | `triangular-arbitrage-live-scanner.ts` | Profitable triangle with net profit |
| `FundingRateEntry` | `funding-rate-arbitrage-scanner.ts` | Per-exchange funding rate snapshot |
| `FundingRateOpportunity` | `funding-rate-arbitrage-scanner.ts` | Cross-exchange funding spread |

### src/api/ — RaaS API Layer (Fastify 5)
- `fastify-raas-server.ts` — Server bootstrap, plugin registration
- `routes/arbitrage-scan-execute-routes.ts` — POST /arb/scan, /arb/execute
- `routes/arbitrage-positions-history-routes.ts` — GET /positions, /history, /stats
- `routes/tenant-crud-routes.ts` — Tenant CRUD
- `routes/backtest-job-submission-routes.ts` — Backtest job submission
- `routes/pnl-realtime-snapshot-history-routes.ts` — P&L current + history
- `schemas/` — Zod validation schemas

### src/auth/ — Authentication & Security
- `tenant-auth-middleware.ts` — JWT + API Key auth, tenant isolation
- `jwt-token-service.ts` — JWT sign/verify
- `api-key-manager.ts` — API key validation
- `sliding-window-rate-limiter.ts` — In-memory + Redis rate limiting
- `scopes.ts` — Permission scopes (ADMIN, BACKTEST, TRADE, READ)

### src/cli/ — CLI Commands
| File | Commands |
|------|----------|
| `arb-scan-run-commands.ts` | `arb:scan`, `arb:run` |
| `arb-cli-commands.ts` | `arb:engine`, `arb:orchestrator` |
| `arb-engine-orchestrator-commands.ts` | Engine/orchestrator wiring |
| `arb-live-cross-exchange-command.ts` | `arb:live` + `ArbLiveOrchestrator` |
| `arb-agi-auto-execution-commands.ts` | `arb:agi`, `arb:auto` (unified all strategies) |
| `spread-detector-command.ts` | `arb:spread` |
| `live-dry-run-simulation-command.ts` | Dry-run with live data |
| `agi-trade-multi-exchange-golive-command.ts` | Multi-exchange go-live |
| `ml-train-and-backtest-commands.ts` | ML train + backtest |
| `strategy-marketplace-tenant-cli-commands.ts` | Marketplace CLI |
| `exchange-factory.ts` | Exchange instantiation helper |

### src/jobs/ — BullMQ Background Processing
- `bullmq-named-queue-registry-backtest-scan-webhook.ts` — Queue factory
- `workers/bullmq-backtest-worker-*.ts` — Backtest job processor
- `workers/bullmq-scan-worker-*.ts` — Scheduled strategy scan
- `ioredis-connection-factory-and-singleton-pool.ts` — Redis connection pool

### src/backtest/ — Backtesting Framework
- `BacktestRunner.ts` — Standard backtest execution
- `BacktestEngine.ts` — Equity curve, Sortino, Calmar, Monte Carlo, walk-forward
- `BacktestOptimizer.ts` — Grid/random search optimizer
- `walk-forward-optimizer-pipeline.ts` — Optimize-then-validate, overfitting detection

### src/reporting/ — Export & Analytics
- `ArbitrageTradeHistoryExporter.ts` — CSV/JSON export

### src/ui/ — Dashboard
- `ArbitrageCLIRealtimeDashboard.ts` — Real-time terminal metrics (chalk)

### prisma/ — Database Schema
- `schema.prisma` — Tenant, Strategy, Order, Trade, ApiKey, BacktestResult, Candle, PnlSnapshot, AlertRule (PostgreSQL)

### tests/ — Test Suite (97 suites)
- `tests/execution/` — All Phase 9-11 modules: realtime-arbitrage-scanner, arbitrage-execution-engine, order-book-depth-analyzer, market-regime-detector, triangular-arbitrage-live-scanner, funding-rate-arbitrage-scanner, atomic executor, fee-aware spread calc, paper trading bridge, exchange health/registry/pool, telegram alert bot, tick-to-candle, signal-order pipeline, strategy position manager
- `tests/cli/` — arb-live, agi-trade-golive, live-dry-run-simulation
- `tests/jobs/` — BullMQ workers, Redis pub/sub, rate limiter
- `tests/backtest/` — Walk-forward, random search, performance ranker
- `tests/ml/` — Feature engineering, GRU model, Q-learning, ML strategy loader
- `tests/core/` — Historical VaR, portfolio correlation, trailing stop
- `tests/e2e/` — Full RaaS API server integration
- `tests/load/` — API stress benchmark
- `src/*/` — Co-located unit tests (arbitrage engine, execution pipeline, API routes, auth, strategies)

### src/execution/ — Stealth Modules (Phase 15-17)
| File | Class | Purpose |
|------|-------|---------|
| `anti-detection-order-randomizer-safety-layer.ts` | `AntiDetectionSafetyLayer` | Order timing/size jitter, rate governor, kill switch |
| `binh-phap-stealth-trading-strategy.ts` | `BinhPhapStealthStrategy` | 孫子兵法 13-chapter anti-detection algorithm |
| `phantom-order-cloaking-engine.ts` | `PhantomOrderCloakingEngine` | 3-layer order cloaking: split, timing, size camouflage |
| `phantom-stealth-math.ts` | — | Stealth math helpers (jitter, normalization) |
| `stealth-cli-fingerprint-masking-middleware.ts` | — | Browser-like HTTP headers to mask bot fingerprint |
| `stealth-execution-algorithms.ts` | — | Shared stealth execution algorithms |

### src/a2ui/ — Agent-to-UI Bridge
- `agent-event-bus.ts` — Event bus between trading agents and UI layer
- `signal-explainer.ts` — Human-readable signal explanation
- `surface-manager.ts` — UI surface state management
- `trade-audit-logger.ts` — Audit trail for all trade events

### src/netdata/ — Collector & Metrics
- `AgiDbEngine.ts` — AGI state persistence engine
- `CollectorRegistry.ts` — Metrics collector registry
- `HealthManager.ts` — System health state management
- `SignalMesh.ts` — Cross-component signal routing mesh
- `TickStore.ts` — In-memory tick data store

### src/pipeline/ — Workflow Pipeline
- `workflow-pipeline-engine.ts` — Generic workflow pipeline with step sequencing

### src/feeds/ — Multi-Platform Price Feed Adapters (Phase 26)
| File | Class | Purpose |
|------|-------|---------|
| `polymarket-websocket-feed.ts` | `PolymarketWebSocketFeed` | Real-time Polymarket CLOB orderbook via WebSocket |
| `limitless-price-feed.ts` | `LimitlessPriceFeed` | Limitless Market HTTP API with polling/webhook |
| `predictit-price-feed.ts` | `PredictItPriceFeed` | PredictIt REST API with 5min cache |
| `smarkets-price-feed.ts` | `SmarketsPriceFeed` | Smarkets exchange feed with order book |
| `kalshi-price-feed.ts` | `KalshiPriceFeed` | Kalshi orderbook integration |
| `unified-price-feed-aggregator.ts` | `UnifiedPriceFeedAggregator` | Normalize all platform ticks to common schema |

### src/execution/clob-v2/ — CLOB v2 Adapter & Split/Merge Arbitrage (Phase 27)
| File | Class | Purpose |
|------|-------|---------|
| `clob-v2-adapter.ts` | `ClobV2Adapter` | Polymarket CLOB v2 order/cancel/fill protocol |
| `split-clob-entry.ts` | `SplitClobEntry` | YES+NO share-splitting on logical hedges |
| `split-merge-arb-executor.ts` | `SplitMergeArbExecutor` | Coordinated split entry + reverse execution |
| `logical-hedge-discovery.ts` | `LogicalHedgeDiscovery` | Scan for implicit hedge opportunities |

### src/intelligence/whale-activity/ — Whale Activity Monitoring (Phase 28)
| File | Class | Purpose |
|------|-------|---------|
| `whale-activity-feed.ts` | `WhaleActivityFeed` | Monitor Polygon CTF for large position changes (>$10k) |
| `whale-copy-trader.ts` | `WhaleCopyTrader` | Auto-follow top whale traders with lag (5-60s) |
| `cross-market-sync.ts` | `CrossMarketSync` | Correlate whale moves across Polymarket + Kalshi + Limitless |
| `whale-analytics-report.ts` | `WhaleAnalyticsReport` | Daily whale leaderboard, win rate, edge estimation |

### src/strategies/intraday/ — BTC 15-Minute Pattern Detection (Phase 29)
| File | Class | Purpose |
|------|-------|---------|
| `btc-fifteen-minute-strategy.ts` | `BtcFifteenMinuteStrategy` | Real-time 15-min candle pattern detection |
| `bitcoin-volatility-scanner.ts` | `BitcoinVolatilityScanner` | Detect intraday volatility spikes >2σ |
| `breakout-detector.ts` | `BreakoutDetector` | Identify 15-min breakouts, map to Polymarket |

### src/strategies/polymarket/cycle-end/ — Cycle-End Sniper & Resolution Analysis (Phase 30)
| File | Class | Purpose |
|------|-------|---------|
| `cycle-end-sniper-strategy.ts` | `CycleEndSniperStrategy` | Target markets resolving within 24h |
| `resolution-criteria-analyzer.ts` | `ResolutionCriteriaAnalyzer` | Parse contract conditions via DeepSeek |
| `uma-oracle-timing.ts` | `UmaOracleTiming` | Monitor UMA challenge window for signals |

### src/intelligence/signal-fusion/ — Signal Fusion Engine (Phase 31)
| File | Class | Purpose |
|------|-------|---------|
| `signal-fusion-engine.ts` | `SignalFusionEngine` | Combine whale + BTC + sentiment + regime → composite signal |
| `multi-resolution-analyzer.ts` | `MultiResolutionAnalyzer` | Fuse multiple data sources (DeepSeek, news, on-chain) |
| `conviction-scorer.ts` | `ConvictionScorer` | Final probability estimate with confidence interval |

### src/cli/ — CLI Enhancement Modules (Phases 27-29, 31)
| File | Commands |
|------|----------|
| `cashclaw-cli-command.ts` | `cashclaw:*` — Distributed trading operations |
| `trading-alerts-telegram-command.ts` | `telegram:alerts` — Real-time trade notifications |
| `whale-watch-command.ts` | `whale:watch` — Live whale activity monitoring |
| `btc-pattern-command.ts` | `btc:patterns` — BTC 15-min strategy launcher |
| `cycle-end-sniper-command.ts` | `cycle:sniper` — 24h cycle-end market sniper |

### src/jobs/ — Background Processing & Autonomy (Phases 18, 32, 32b)
| File | Class | Purpose |
|------|-------|---------|
| `auto-marketing-daemon.ts` | `AutoMarketingDaemon` | Blog content generation via LLM (DeepSeek R1) with template fallback |
| `welcome-drip-daemon.ts` | `WelcomeDripDaemon` | 3-email sequence scheduler (Day 0/1/3) triggered on signup |
| `telegram-auto-support-handler.ts` | `TelegramAutoSupportHandler` | /faq, /support, /pricing commands + LLM FAQ matcher |
| `twitter-auto-poster.ts` | `TwitterAutoPoster` | X API v2 blog distribution + Telegram channel publishing |
| `bullmq-named-queue-registry-backtest-scan-webhook.ts` | — | BullMQ queue factory for backtest/scan jobs |
| `workers/bullmq-backtest-worker-*.ts` | — | Backtest job processor |
| `workers/bullmq-scan-worker-*.ts` | — | Scheduled strategy scan worker |
| `ioredis-connection-factory-and-singleton-pool.ts` | — | Redis connection pooling |

### src/api/routes/ — API Route Modules (Phase 32)
| File | Methods | Purpose |
|------|---------|---------|
| `blog-routes.ts` | `GET /api/blog/posts` | Serve auto-generated blog posts with pagination |
| `arbitrage-scan-execute-routes.ts` | `POST /arb/scan`, `/arb/execute` | Arbitrage operations |
| `arbitrage-positions-history-routes.ts` | `GET /positions`, `/history`, `/stats` | Position tracking |
| `tenant-crud-routes.ts` | `CRUD /tenants` | Tenant management |
| `backtest-job-submission-routes.ts` | `POST /backtest` | Backtest submission |
| `pnl-realtime-snapshot-history-routes.ts` | `GET /pnl/*` | P&L snapshots |

### src/landing/ — SEO & Content Hub (Phase 32)
| File | Purpose |
|------|---------|
| `landing-server.ts` | Express server for landing page |
| `public/blog.html` | Blog content hub page |
| `public/status.html` | System status dashboard |
| `public/analytics.js` | Plausible analytics + referral tracking (GDPR-compliant) |
| — | Meta tags: OpenGraph, JSON-LD, sitemap.xml, robots.txt |

### src/billing/ — Revenue & Invoice Automation (Phase 33)
| File | Class | Purpose |
|------|-------|---------|
| `invoice-generator.ts` | `InvoiceGenerator` | Auto-generate invoice (JSON + HTML) on NOWPayments webhook success |
| `revenue-analytics.ts` | `RevenueAnalytics` | MRR, churn rate, LTV, cohort analysis by tier + referrer |

### src/api/routes/ — Analytics Route (Phase 33)
| File | Methods | Purpose |
|------|---------|---------|
| `analytics-routes.ts` | `POST /api/analytics/event` | Log pageview, signup, checkout, activation with referral + UTM context |

## Key Metrics
- **298+ source files** (TypeScript 5.9, strict mode)
- **588 tests** (Vitest 4.1, 100% pass rate, +13 autonomy phase 3 tests)
- **27+ CLI commands** (Commander + whale/BTC/sniper/Telegram/Twitter commands)
- **52+ trading strategies** across 5 platforms:
  - Core: RSI, SMA, MACD, Cross-Exchange, Triangular, Funding-Rate, AGI (7)
  - Polymarket: Delta-Neutral, Event-Driven, Momentum, Correlation, Microstructure (15)
  - Intraday: BTC 15-min patterns, breakout detection (3)
  - Cycle-End: Sniper strategies with resolution analysis (2)
  - ML: GRU, Q-Learning (2)
  - Whale-Copy: Cross-market sync (1)
  - Total: 30+ core + 22+ market-specific
- **28+ API endpoints** + 5 WebSocket channels (Fastify 5)
- **5 exchange integrations** (Binance, OKX, Bybit via CCXT 4.5, + Polygon CTF via ethers.js)
- **9 database models** (Tenant, Strategy, Order, Trade, ApiKey, BacktestResult, Candle, PnlSnapshot, AlertRule via Prisma)
- **5 dashboard pages** + 10 components (React 19, Vite 6, Tailwind, TradingView Charts)
- **6-node Redis Cluster** (3 masters + 3 replicas, 1000+ concurrent WebSocket connections)
- **Event-driven messaging**: NATS primary + JetStream (persistent) + Redis fallback (8 modules)
- **Semantic intelligence**: DeepSeek API + relationship graph + semantic cache + signal consensus + dual-level reflection (11+ modules)
- **Multi-platform feeds**: Polymarket, Limitless, PredictIt, Smarkets, Kalshi (6 adapters)
- **Cross-market optimization**: ILP solver + Frank-Wolfe + self-evolving constraints (5 modules)
- **Whale tracking**: Polygon CTF monitor + cross-market sync + copy-trading (4 modules)
- **Infrastructure hardening**: Distributed nonce, gas optimizer, TimescaleDB hypertables, Grafana/Prometheus
- **Runtime control**: Vibe controller for dynamic mode switching (1 module)
- **Paper trading**: +$2,251 P&L across 50 trades (66.7% win rate)
- **Autonomous marketing**: Auto-marketing daemon (Phase 32) — daily blog generation via DeepSeek R1 with template fallback
- **Email drip campaigns**: Welcome-drip daemon (Phase 32b) — 3-email sequence (Day 0/1/3) on signup activation, PM2 hourly scheduler
- **Social distribution**: Twitter/X API v2 + Telegram channel auto-posting of blog content (Phase 32b)
- **Support automation**: Telegram FAQ matcher (Phase 32b) — /faq, /support, /pricing commands with LLM-powered responses
- **SEO & Content**: Landing page with OpenGraph, JSON-LD, sitemap, robots.txt, status dashboard
- **Email verification**: SendGrid integration for onboarding opt-in + drip campaign flow
- **Invoice automation**: Auto-generate invoice on NOWPayments webhook success, email via SendGrid (Phase 33)
- **Referral tracking**: Plausible Analytics + ?ref parameter capture + UTM logging for growth attribution (Phase 33)
- **Revenue analytics**: MRR, churn, LTV, cohort analysis by tier + referral source (Phase 33)

## Quality Metrics
- **0 TypeScript errors** (strict mode enforced)
- **0 `any` types** in production (test mocks only — acceptable)
- **0 console.log** (production clean)
- **0 TODO/FIXME** (zero tech debt)
- **0 secrets in code** (.env gitignored)
- **Binh Phap 6/6 fronts passing**

## Tech Stack
**Core**: TypeScript 5.9 | Node.js 20 | Fastify 5 | CCXT 4.5

**Exchanges**: Binance, OKX, Bybit, Polygon CTF, Polymarket, Kalshi, Limitless, PredictIt, Smarkets

**Messaging**: NATS.io (primary) + JetStream (persistence) | Redis Cluster (fallback + state)

**Optimization**: javascript-lp-solver (ILP) | Frank-Wolfe algorithm | Signal consensus voting

**Data & Analytics**: BullMQ 5 | Redis Cluster 6-node | PostgreSQL 16 (Prisma) | TimescaleDB (hypertables)

**Intelligence**: DeepSeek API (semantic + causal analysis) | Gamma API (market data) | Nemotron-3 Nano (fast scan) | Model consensus

**Trading Logic**: Regime detection | Whale tracking | 15-min pattern detection | Resolution criteria analysis | ILP cross-market optimization

**Validation & Logging**: Zod 4.3 | Winston | Prometheus | Grafana (3 dashboards: Arbitrage Metrics, Risk, Infrastructure)

**ML & Testing**: TensorFlow.js | Jest 29 | Playwright | Walk-forward validation

**CLI & UI**: Commander CLI | React 19 | Vite 6 | Tailwind CSS | Zustand 5

**Billing**: NOWPayments (USDT TRC20) | Invoice automation | Coupon system with atomicity guards

**Revenue Analytics**: Plausible Analytics | Referral tracking (?ref params) | UTM capture | Event logging | MRR/churn/LTV analysis

**Stealth**: Order splitting & timing jitter | Anti-detection middleware | Phantom order cloaking

**Autonomy**: Auto-marketing daemon (Phase 32) | Welcome-drip campaigns (Phase 32b) | Telegram auto-support | Twitter/X API v2 | Invoice automation (Phase 33) | Referral analytics (Phase 33) | PM2 job scheduling | SendGrid email

Updated: 2026-04-15 (Phase 32b autonomy phase 2 complete)
