---
name: stoll89-modularization-report
description: Research on Stoll (1989) spread decomposition and modularization strategy for arbitrage/execution engines.
metadata:
  type: reference
---

# RESEARCH REPORT: Stoll (1989) Microstructure & Modularization Strategy

## 1. Stoll (1989) Covariance Spread Decomposition Engine
Theoretical framework separates bid-ask spread ($S$) into three components: adverse selection ($\alpha$), inventory holding ($\beta$), and order processing ($\gamma$).

### Core Price/Midpoint Math:
- **Price Change Autocovariance:** $Cov(\Delta P_t, \Delta P_{t-1}) = -\frac{1}{4} S^2 [ \alpha(1-\theta)^2 + \beta ]$
- **Midpoint Revision Autocovariance:** $Cov(\Delta M_t, \Delta M_{t-1}) \approx \frac{1}{4} S^2 \alpha \theta(1-\theta)$
- **Solving:** Requires empirical rolling window estimates of price and mid-quote autocorrelation to isolate hidden $\alpha, \beta, \gamma$.

### Trade-offs:
- **Pros:** Robust mechanism for detecting latent information asymmetry (alpha) vs cost of liquidity provision (gamma).
- **Cons:** Extremely sensitive to microstructure noise, latency of trade arrival, and quote flickering in modern high-frequency environments.
- **Architectural Fit:** Needs a dedicated `MicrostructureEngine` module that feeds into the existing order management desk.

## 2. Modularization Strategy (Quality Ratchet v1.1.0)
Strategy for refactoring `src/desk/arbitrage/orchestrator.ts` and `src/desk/execution/live-order-manager.ts` to < 150 LOC.

### Strategy:
1. **Orchestrator extraction:** Move `LifecycleManager` (45 lines) and `QueueMetricsHandler` (60 lines) into `./orchestrator/lifecycle.ts` and `./orchestrator/metrics.ts`. Maintain the `Orchestrator` as a thin facade.
2. **Order Manager extraction:** Extract `SubmissionValidator` (55 lines) and `OrderHistoryProcessor` (45 lines) into `./execution/validator.ts` and `./execution/history.ts`.
3. **Typing Rule:** Replace all `:any` declarations with explicit interfaces defined in `types/execution.ts` or local scoped types. Enforce strictly via ESLint/TSC build.

### Risk/Mitigation:
- **Breaking Changes:** Significant risk to order state consistency. Mitigation: Write unit tests covering lifecycle transitions *before* modularization.
- **Dependency Hell:** Keep shared logic in `src/desk/common/`. Avoid deep nesting that forces convoluted import paths.

## 3. Recommendation
- **Rank 1:** Implement `StollEngine` as a service; extract metrics to `metrics.ts` to facilitate live calibration of trading thresholds.
- **Rank 2:** Mandatory LOC reduction to 150 in mentioned files before any new business feature delivery.

## Unresolved Issues:
- Does the 2026 market environment still honor Stoll's assumptions in the presence of fragmented cross-venue liquidity? Stoll assumed a single limit order book; modern arbitrage requires multi-venue consolidation.

---
[[stoll89-modularization-report]]
