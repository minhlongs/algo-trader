# Technical Research: Polymarket Strategies, Risk Engine & Alpha Lab Hardening

## 1. Executive Summary & Current State
- **Polymarket Strategies (`src/desk/strategies/polymarket/`)**: 40+ modular binary/prediction market strategies extending `BasePolymarketStrategy`. Order sizing relies on ad-hoc heuristics (`10 * confidence`) or hardcoded USDC sizing without unified pre-trade portfolio VaR checks.
- **Risk Engine (`src/desk/risk/`)**: Mature math libraries (`ValueAtRiskCalculator`, `computeVarCvar`, `RegimeAwareKelly`, `TieredDrawdownBreaker`, `LiveExecutionGuard`). Disconnect: VaR/CVaR and Kelly sizers run in isolation; `LiveExecutionGuard` checks only static fraction (2%) rather than dynamic portfolio VaR limits.
- **Alpha Lab Pipeline (`src/alpha-lab/`)**: 6-stage lifecycle state machine (`DISCOVERED` -> `VALIDATED` -> `PAPER_ACTIVE` -> `PROMOTED_LIVE_ELIGIBLE` -> `QUARANTINED`/`RETIRED`), 10+1 statistical gates, SHA-256 research ledger. Disconnect: candidate generators target standard OHLCV candles, disconnected from Polymarket binary event probability dynamics.

## 2. Hardening Requirements for Paper-to-Live Pipeline
1. **Dynamic VaR/CVaR Pre-Trade Gate**: Inject `computeVarCvar` into `LiveGuardHandoffCoordinator` to reject trades when 1-day 99% portfolio VaR exceeds max risk budget ($1,000 / 10% NAV).
2. **Unified Regime-Aware Fractional Kelly Sizer**: Bind `RegimeAwareKelly` directly into `BasePolymarketStrategy.enterPosition()` and `StrategyLiveBridge.computeSize()`, replacing arbitrary dollar defaults with edge/odds estimation $f^* = (bp - q)/b \times \text{fraction}_{\text{regime}}$.
3. **Tiered Auto-Approval & Human-in-the-Loop Limits**: Standardize auto-approval limits across all strategies:
   - Level 0 (Auto-Approve): $<\$250$, Sharpe $\ge 1.8$, Paper duration $\ge 30\text{d}$, drawdown $<5\%$.
   - Level 1 (Auto-Approve with Rate Limit): $\$250\text{--}\$1,000$, max 2 trades/hour, VaR impact $<2\%$.
   - Level 2 (Manual Gate / Escalation): $>\$1,000$ or novel market token requires explicit operator signature.

## 3. Architecture Options & Trade-Off Matrix

| Option | Approach | Performance | Complexity | Maintenance | Risk | Fit Rank |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Option A (Integrated Handoff)** | Unify VaR + Kelly + Auto-Approval in `LiveGuardHandoffCoordinator` & bind to `BasePolymarketStrategy` | High (<2ms latency overhead) | Low (Reuses existing modules) | Minimal (KISS/DRY) | Low | **#1 (Recommended)** |
| **Option B (Separate Microservice)** | Split Risk Engine to standalone gRPC/HTTP risk service | Poor (+15-30ms network hop) | High (New infra, IPC errors) | High (Multi-repo drift) | Med | **#3** |
| **Option C (Orchestrator-Only Hook)** | Enforce gates strictly at `LiveTradingOrchestrator.placeOrder` only | Med (Late rejection in stack) | Med (Strategy unaware of size) | Med (Duplicate sizing math) | Med | **#2** |

## 4. Adoption Risk & Source Credibility
- **Sources Consulted**:
  1. *Polymarket CLOB API v2 Specification* (Official Docs / EIP-712 Order Signing). High credibility.
  2. *Kelly, J. L. (1956) / Thorp, E. O. (2006)*: "The Kelly Criterion in Blackjack, Sports Betting, and Wall Street". Foundation for quarter-Kelly sizing in asymmetric binary payoffs. Maintainer standard.
  3. *Jorion, P. (2006) / McNeil et al. (2015)*: "Value at Risk & Quantitative Risk Management". Benchmark for Acklam quantile parametric/historical CVaR.
  4. *López de Prado, M. (2018)*: "Advances in Financial Machine Learning" (Deflated Sharpe Ratio / Walk-forward overfit prevention). Foundation for Alpha Lab Gate 10+1.
- **Adoption Risk**: Low. All math primitives exist in `src/desk/risk/` and `src/alpha-lab/validation/`. No new external runtime dependencies needed. Zero breaking changes to `BasePolymarketStrategy` consumers.

## 5. Architectural Fit & Recommended Implementation Steps
- **Fit Evaluation**: Matches existing TypeScript/Node stack, aligns with modular `<200` LOC rule, honors YAGNI/KISS by composing `regime-aware-kelly.ts`, `cross-engine-var-cvar.ts`, and `live-guard-handoff-coordinator.ts`.
- **Ranked Action Plan**:
  1. **Step 1 (Handoff Hardening)**: Enhance `LiveGuardHandoffCoordinator` with `evaluateVaR()` using `computeVarCvar` and auto-approve threshold ($500 default, configurable via `LIVE_AUTO_APPROVE_MAX_USD`).
  2. **Step 2 (Strategy Bridge Sizing)**: Update `StrategyLiveBridge.computeSize()` and `BasePolymarketStrategy.enterPosition()` to query `RegimeAwareKelly` with probability confidence and current market odds.
  3. **Step 3 (Alpha Lab Prediction-Market Adapter)**: Add binary prediction market candidate generator in `src/alpha-lab/alpha-discovery/` modeling probability bounds and time-to-resolution decay.

## 6. Limitations
- Research focused on pre-trade risk gating; did not benchmark Polygon gas spike slippage during high-volatility event resolution.
- Live orderbook latency profiling was restricted to static CLOB mock and REST endpoints.

## 7. Unresolved Questions
1. Should the manual escalation gate for orders $>\$1,000$ trigger a Telegram bot interactive webhook or block until CLI operator override?
2. For binary outcome tokens approaching expiration ($T < 2\text{ hours}$), should Kelly sizing switch to binary settlement expectancy or default to flat delta?
