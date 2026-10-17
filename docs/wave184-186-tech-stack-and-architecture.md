# Wave 184-186 Tech Stack & Architecture Specification

## 1. Executive Overview
Wave 184-186 expands the algorithmic trading desk with three premier quantitative engines and continues the systematic modularization of core desk systems under the strict Quality Ratchet v1.1.0 (< 180 LOC / file, hard ceiling < 200 LOC).

## 2. Quantitative Engines Architecture

### Wave 184: Bertsimas-Lo (1998) Dynamic Optimal Execution (`src/desk/bertsimaslo/`)
- `bertsimas-lo-types.ts` (≤ 60 LOC): Parameter configurations, trajectory points, and cost breakdown interfaces.
- `bertsimas-lo-math.ts` (≤ 120 LOC): Backward dynamic programming recursions, information state covariance, and expected execution cost evaluation.
- `bertsimas-lo-engine.ts` (≤ 120 LOC): Public execution planner API, benchmark comparison against TWAP and immediate liquidation, and sensitivity analysis.
- `index.ts` (≤ 15 LOC): Barrel export.

### Wave 185: Merton (1971) Continuous-Time Portfolio Choice (`src/desk/mertonportfolio/`)
- `merton-portfolio-types.ts` (≤ 60 LOC): CRRA parameters, wealth states, optimal control paths, and ruin probability types.
- `merton-portfolio-math.ts` (≤ 120 LOC): Analytical Merton fraction, time-dependent consumption propensity ODE solutions, and terminal wealth distribution moments.
- `merton-portfolio-engine.ts` (≤ 120 LOC): Portfolio optimizer API, continuous rebalancing schedule, and drawdown/solvency guarantees.
- `index.ts` (≤ 15 LOC): Barrel export.

### Wave 186: Vasicek (2002) ASRF Credit Risk Copula (`src/desk/vasicekcopula/`)
- `vasicek-copula-types.ts` (≤ 60 LOC): Portfolio parameters (PD, LGD, asset correlation $\rho$), confidence levels, and capital requirement interfaces.
- `vasicek-copula-math.ts` (≤ 120 LOC): Cumulative loss distribution $F(x)$, inverse loss distribution (quantile function), and numerical integration for Expected Shortfall.
- `vasicek-copula-engine.ts` (≤ 120 LOC): Portfolio Credit VaR, Unexpected Loss, Economic Capital (Basel II/III IRB), and sensitivity to correlation $\rho$.
- `index.ts` (≤ 15 LOC): Barrel export.

## 3. Desk Modularization Targets (< 180 LOC per file)
Systematic extraction of 5 oversized modules:
1. `src/desk/risk/atr-trailing-stop.ts` & `atr-trailing-stop-state.ts`
2. `src/desk/feeds/market-data-multiplexer.ts` & `market-data-multiplexer-router.ts`
3. `src/desk/daemon/desk-daemon.ts` & `desk-daemon-state.ts`
4. `src/desk/arbitrage/risk/arbitrage-risk-guard.ts` & `arbitrage-risk-evaluator.ts`
5. `src/desk/feeds/polymarket-websocket-feed.ts` & `polymarket-feed-protocol.ts`

## 4. Tech Stack & Quality Gates
- **Language / Runtime**: TypeScript 5.8+, Node.js 22 LTS.
- **Testing Engine**: Vitest 3.x, zero-mock pure quantitative testing.
- **Standards**: Zero `:any` types, zero `console.log` in production, all files strictly < 180 LOC.
