# Original User Request

## Initial Request — 2026-05-30T04:50:01-07:00

Dự án triển khai khung bảo mật và tuân thủ (Compliance & Security Hardening Framework) cho hệ thống Algo-Trader RaaS Dashboard theo Roadmap Phase 35.

Working directory: /Users/macbook/algo-trader
Integrity mode: development

## Requirements

### R1. Multi-Tenant Audit Logging
Xây dựng một hệ thống ghi nhật ký kiểm toán (audit logs) bất biến cho toàn bộ các hoạt động giao dịch (trades), đặt lệnh (orders) và cấu hình hệ thống. Dữ liệu audit logs phải được cô lập hoàn toàn giữa các tenant (`tenantId`), lưu trữ an sau và hỗ trợ truy vấn nhanh qua API.

### R2. Redis-Based Distributed Rate Limiter
Nâng cấp hệ thống giới hạn tần suất (rate limiting) từ cơ chế in-memory hiện tại lên Redis-based sliding window rate limiter để hỗ trợ môi trường cụm phân tán (Redis Cluster). Cho phép cấu hình các mức giới hạn (rate limits) khác nhau tùy thuộc vào pricing tier của tenant (FREE, PRO, ENTERPRISE).

### R3. AES-256 Encryption at Rest
Tích hợp cơ chế mã hóa dữ liệu nhạy cảm ở chế độ nghỉ (Encryption at Rest) sử dụng thuật toán AES-256-GCM. Toàn bộ API keys, API secrets và thông tin xác thực sàn giao dịch của các tenant khi lưu xuống Database phải được mã hóa tự động và chỉ được giải mã khi cần thiết tại runtime.

## Acceptance Criteria

### Security & Compliance
- Dữ liệu nhạy cảm (API Keys, secrets) được lưu trữ dưới dạng mã hóa AES-256-GCM trong Database.
- Audit logs ghi nhận đầy đủ IP, user agent, timestamp, hành động, và tenantId, đồng thời được cô lập nghiêm ngặt giữa các tenant.
- Redis Rate Limiter chặn chính xác các requests vượt ngưỡng cấu hình theo tier của tenant và trả về mã lỗi HTTP 429.

### Quality & Tests
- Toàn bộ test suite hiện tại và các test mới viết thêm duy trì trạng thái PASS 100%.
- 0 lỗi biên dịch TypeScript (`npx tsc --noEmit` ở root và `dashboard` thành công).
- Không sử dụng kiểu dữ liệu `any` hoặc `@ts-ignore` trong mã nguồn mới.

## Follow-up — 2026-09-24T17:09:19Z

Build and wire the Alpha-Lab Autonomous Strategy Discovery pipeline into the algo-trader execution loop. Continuously evaluate hypothesis candidates through walkforward validation and statistical robustness gates, and safely route passing alpha signals through the AISignalAdapter into paper trading with an automated promotion gate to live execution guards.

Working directory: /Users/macbook/algo-trader
Integrity mode: benchmark

## Requirements

### R1. Continuous Strategy Discovery & Walkforward Evaluation Pipeline
Build an autonomous strategy discovery workflow that evaluates candidate alpha hypotheses across multi-regime historical market data using walkforward evaluation. Candidates must be tested against quantitative survival gates including out-of-sample Sharpe ratio, max drawdown, regime consistency, and transaction cost stress. Failing candidates must be rejected with explicit diagnostic reasons.

### R2. Paper Trading Signal Ingestion & Execution Routing
Wire passing alpha candidates into the paper trading execution system via the `AISignalAdapter`. The pipeline must ingest generated AI signals, validate them against confidence, expectancy, and regime filters, and execute simulated orders with realistic slippage, exchange fees, and position sizing.

### R3. Automated Promotion State Machine & Live Guard Handoff
Implement a statistical promotion state machine that monitors the live performance of active paper-traded alphas (tracking minimum trade sample size, win rate, profit factor, and drawdown). Alphas that satisfy the promotion criteria become eligible for live trading, where order routing is protected by `LiveExecutionGuard` and platform risk gates.

### R4. Provenance Ledger & Audit Trail
Record all experiment configurations, walkforward evaluation metrics, paper execution fills, and promotion state transitions into the immutable research ledger and run card store, ensuring complete reproducibility and traceability.

## Acceptance Criteria

### Pipeline Verification
- [ ] End-to-end discovery and walkforward evaluation runs programmatically and produces reproducible evaluation artifacts.
- [ ] Candidates failing survival gates (e.g. Sharpe < hurdle, negative expectancy under cost stress) are rejected without entering paper trading.
- [ ] Passing alpha candidates generate valid `AISignal` objects that successfully pass through `AISignalAdapter` and enter the paper trading execution loop.
- [ ] Paper trading engine executes signals, calculates real-time P&L, tracks equity curves, and enforces position sizing limits.
- [ ] Promotion state machine correctly transitions strategies across lifecycle states (`DISCOVERED` -> `PAPER_ACTIVE` -> `PROMOTED_LIVE_ELIGIBLE` -> `RETIRED`) based on objective metric thresholds.
- [ ] All lifecycle transitions, backtest runs, and execution records are persisted to the provenance ledger and run-card store.

### Quality & Safety Guardrails
- [ ] Zero TypeScript errors (`npx tsc --noEmit` exits 0).
- [ ] Zero new `:any` types introduced (strict TypeScript typing maintained).
- [ ] Zero `console.log` / `console.error` calls introduced (use structured logger utility).
- [ ] All new and existing test suites pass with 100% pass rate.
- [ ] Existing coverage floors (94% lines, 92% statements, 86% branches, 93% functions) maintained or exceeded.

## 2026-09-28T02:46:44Z

Build and integrate the production-ready Prediction Market Automated Market Maker (AMM / CPMM / LMSR) Liquidity Engine & Combinatorial Negative-Risk Arbitrage Engine into algo-trader (`src/desk/amm/`).

Working directory: /Users/macbook/algo-trader
Integrity mode: benchmark

## Requirements

### R1. Prediction Market AMM Pricing & Constant Product / LMSR Liquidity Engine
Implement mathematical pricing models for binary and multi-outcome prediction markets:
1. Logarithmic Market Scoring Rule (LMSR):
   - Cost function: $C(\vec{q}) = b \ln \left( \sum_{i=1}^n e^{q_i / b} \right)$
   - Marginal spot prices: $p_i(\vec{q}) = \frac{e^{q_i / b}}{\sum_{j=1}^n e^{q_j / b}}$ with $\sum_{i=1}^n p_i = 1$
   - Trade cost computation: $\Delta C = C(\vec{q} + \Delta\vec{q}) - C(\vec{q})$
   - Dynamic liquidity parameter $b$ adaptation based on pool depth and volume.
2. Constant Product Market Maker (CPMM) variant for binary outcome tokens ($k = x \cdot y$).
3. Multi-token pool state manager with orderbook and virtual AMM reserves.

### R2. Combinatorial Negative-Risk & Mutually Exclusive Outcome Arbitrage
Implement automated negative-risk and basket arbitrage across multi-outcome market sets:
1. Combinatorial mispricing detection:
   - Overpriced basket condition: $\sum_{i=1}^n P_i > 1.00 + \text{fee}$ (mint complete set for 1.00 USDC, sell all outcomes).
   - Underpriced basket condition: $\sum_{i=1}^n P_i < 1.00 - \text{fee}$ (buy all outcomes, merge into 1.00 USDC).
2. Atomic multi-leg execution coordinator with gas-cost, fee-structure, and slippage netting.
3. Fallback compensatory unwinds if any leg fails or experiences partial fills.

### R3. Dynamic Liquidity Provision & Cross-Market Rebalancing
1. Adaptive 2-sided liquidity quoting agent operating on AMM pools and Polymarket CLOB books.
2. Cross-market inventory delta rebalancer: continuously hedging directional exposure against external CEX/DEX reference price feeds.
3. Adverse selection and toxic sweep mitigation on AMM pools (dynamic fee adjustment and liquidity pull tripwires).

### R4. Pre-Trade Risk Gates, Telemetry & Hash-Chained Audit Logging
1. Pre-trade risk enforcement: 5% Quarter-Kelly position cap, max pool exposure limits, 15% daily drawdown circuit breaker, and venue latency filters.
2. Low-latency Prometheus metrics (`amm_liquidity_depth_usd`, `amm_trade_volume_usd`, `amm_arbitrage_pnl_usd`, `amm_pool_reserves`, `amm_vpin_toxicity`).
3. SHA-256 HMAC hash-chained `AmmAuditLogger` recording all pool transactions, arbitrage executions, liquidity provisions, and risk rejections.

## Acceptance Criteria

### Execution & Mathematical Verification
- [ ] LMSR cost function and spot price equations are mathematically exact and numerically stable against extreme log-sum-exp overflows across $n \ge 10$ outcomes.
- [ ] CPMM binary curve maintains invariant $k = x \cdot y$ under buy, sell, and add/remove liquidity operations.
- [ ] Combinatorial negative-risk scanner detects mispricings ($\sum P_i \ne 1.00$) and generates net-profitable atomic execution plans.
- [ ] Atomic multi-leg coordinator executes bundles with compensatory unwind protection on partial fills.
- [ ] Pre-trade risk gates block trades exceeding Quarter-Kelly or daily drawdown limits.
- [ ] Comprehensive 5-Tier test suite (Tier 1: Feature Coverage, Tier 2: Boundary Conditions, Tier 3: Cross-Feature Interactions, Tier 4: Real-World Workloads, Tier 5: Adversarial Hardening) passes 100%.

### Quality & Safety Guardrails
- [ ] `npm run build` exits 0 with 0 TypeScript compilation errors.
- [ ] Zero new `:any` types in production code (strict TypeScript typing maintained).
- [ ] Zero `console.log` / `console.error` calls introduced (use structured logger utility).
- [ ] 100% test pass rate across all new and existing test suites.
- [ ] All new source files modularized ($\le 200$ visual LOC) and strictly compliant with repo standards.


## Follow-up — 2026-09-24T18:04:11Z

The parent received a network timeout notification. Resume execution and continue coordinating the teamwork project from current progress in .agents/teamwork/PROJECT.md.

## 2026-09-28T17:22:41Z

Build and integrate the production-ready Unified Multi-Strategy Portfolio Allocator, Global Risk Guard & Smart Order Router (SOR) into algo-trader (`src/desk/portfolio/`, `src/desk/risk/`, `src/desk/sor/`, `src/desk/telemetry/`).

Working directory: /Users/macbook/algo-trader
Integrity mode: benchmark

## Requirements

### R1. Dynamic Multi-Strategy Capital Allocator & Risk Parity Engine
Implement an institutional capital allocation framework across all 4 trading engines (Arbitrage, MARL Market Making, Prediction Market AMM Liquidity, Alpha-Lab Quantitative Strategies):
1. **Risk Parity & Equal Risk Contribution (ERC)**: Dynamically weights capital allocations using rolling covariance matrices and volatility estimates to ensure no single strategy family dominates portfolio risk.
2. **Performance-Weighted Tilts**: Dynamically tilts allocations toward strategies with higher rolling Sharpe/Sortino ratios and positive regime alignment.
3. **Capital Lock & Minimum Buffer Guard**: Guarantees working capital reserves (minimum 20% liquid unallocated cash buffer) and prevents starvation of active high-expectancy positions during rebalancing.

### R2. Global Cross-Engine Portfolio Risk & Correlation Guard
Enforce unified portfolio-wide risk governance across all strategies and venues:
1. **Value at Risk (VaR & CVaR / Expected Shortfall)**: Computes real-time Parametric and Historical VaR (95% and 99% confidence horizons) and conditional Value at Risk across all open positions.
2. **Leverage & Exposure Constraints**: Enforces portfolio-level gross leverage ($\le 3.0\text{x}$) and net exposure limits across centralized exchanges (CCXT/Binance) and decentralized prediction markets (Polymarket CLOB and AMM).
3. **Multi-Tier Global Circuit Breaker**: Synchronizes a 4-tier circuit breaker (`NORMAL` $\to$ `ALERT` $\to$ `REDUCE` $\to$ `HALT` $\to$ `HARD_STOP`) across all engines simultaneously upon aggregate portfolio drawdown breaches (5% ALERT, 10% REDUCE, 15% HALT, 20% HARD_STOP) or sudden correlation spikes.

### R3. Smart Order Router (SOR) & Multi-Venue Liquidity Aggregator
Intelligently route and execute orders across heterogeneous liquidity pools:
1. **Cross-Venue Order Routing**: Ingests real-time order books and AMM price impact curves across Binance/Bybit, Polymarket CLOB, and AMMs, selecting optimal routing paths to maximize net realized proceeds.
2. **Order Splitting & Execution Strategies**: Implements TWAP, VWAP, and Iceberg execution for parent orders exceeding liquidity thresholds, distributing order slices across venues to minimize market impact and slippage.
3. **Execution Cost & Fee Minimization**: Factor in taker/maker fee differentials and gas costs across execution venues to ensure net price improvement.

### R4. Unified Cross-Engine Telemetry & Real-Time PnL Attribution Hub
Provide institutional real-time observability and performance reporting:
1. **Unified MTM PnL & Margin Attribution**: Consolidates mark-to-market PnL, realized cash flow, margin utilization, and return on capital employed (ROCE) across all 4 strategy engines in real time.
2. **Real-Time Telemetry & Event Streaming**: Emits standardized portfolio events, risk metric snapshots, and execution logs via NATS / internal bus for downstream monitoring dashboards.
3. **Automated End-of-Day (EOD) Risk Ledger**: Persists daily immutable snapshots of risk allocations, strategy performance, drawdown events, and execution efficiency in the research provenance store.

## Acceptance Criteria

### Execution & Mathematical Verification
- [ ] Risk Parity (ERC) allocator converges iteratively to equal risk contribution within $10^{-4}$ tolerance across non-zero covariance matrices.
- [ ] Parametric and Historical VaR / CVaR calculations accurately reflect joint portfolio tail risk under multi-asset scenarios.
- [ ] Multi-tier global circuit breaker triggers systematic de-risking and halts execution across all 4 engines simultaneously upon simulated drawdown breach.
- [ ] Smart Order Router (SOR) achieves provable price improvement over naive single-venue routing on multi-venue orders.
- [ ] Unified PnL attribution accurately sums individual engine equity curves to match consolidated portfolio balance without accounting drift.
- [ ] Comprehensive 5-Tier test suite (Tier 1: Feature Coverage, Tier 2: Boundary Conditions, Tier 3: Cross-Feature Interactions, Tier 4: Real-World Workloads, Tier 5: Adversarial Hardening) passes 100%.

### Quality & Safety Guardrails
- [ ] `bun run build` and `bun run tsc --noEmit` exit 0 with 0 TypeScript compilation errors.
- [ ] Zero new `:any` types in production code (strict TypeScript typing maintained).
- [ ] Zero `console.log` / `console.error` calls introduced (use structured logger utility).
- [ ] 100% test pass rate across all new and existing test suites.
- [ ] All new source files modularized ($\le 200$ visual LOC) and strictly compliant with repo standards.
