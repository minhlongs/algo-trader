# Quantitative Credit Risk & Desk Modularization Research: Wave 184-186

## 1. Vasicek (2002) Asymptotic Single Risk Factor (ASRF) Portfolio Credit Risk Engine
Oldrich Vasicek (2002), "The Distribution of Loan Portfolio Value", *Risk*.

### Mathematical Formulation
One-factor Gaussian copula latent variable representation for default of obligor $i$:
$$X_i = \sqrt{\rho} Y + \sqrt{1 - \rho} Z_i$$
where:
- $Y \sim \mathcal{N}(0, 1)$ is the macro systematic economic factor.
- $Z_i \sim \mathcal{N}(0, 1)$ is the idiosyncratic credit shock, independent of $Y$.
- $\rho \in (0, 1)$ is the uniform asset return correlation.

Default occurs when asset return falls below default threshold:
$$X_i < c_i \quad \implies \quad c_i = \Phi^{-1}(PD_i)$$

### Conditional Default Probability
Given macro systematic state $Y = y$:
$$p(y) = \Phi\left( \frac{\Phi^{-1}(PD) - \sqrt{\rho} y}{\sqrt{1 - \rho}} \right)$$

### Vasicek Cumulative Portfolio Loss Distribution
In an asymptotic infinitely granular portfolio, by the Law of Large Numbers, portfolio loss fraction $L$:
$$F(x) = \mathbb{P}(L \le x) = \Phi\left( \frac{\sqrt{1 - \rho}\Phi^{-1}(x) - \Phi^{-1}(PD)}{\sqrt{\rho}} \right), \quad 0 \le x \le 1$$

### Risk Metrics & Regulatory Capital (Basel II / III IRB)
1. **Credit Value-at-Risk (Credit VaR) at Confidence Level $\alpha$ (e.g. 99.9%)**:
   $$\text{VaR}_\alpha = \text{LGD} \cdot \Phi\left( \frac{\Phi^{-1}(PD) + \sqrt{\rho}\Phi^{-1}(\alpha)}{\sqrt{1 - \rho}} \right)$$
2. **Expected Loss (EL)**:
   $$\text{EL} = \text{LGD} \cdot PD$$
3. **Unexpected Loss (UL / Economic Capital)**:
   $$\text{UL}_\alpha = \text{VaR}_\alpha - \text{EL}$$
4. **Expected Shortfall (ES / Conditional VaR)**:
   $$\text{ES}_\alpha = \frac{1}{1 - \alpha} \int_\alpha^1 \text{VaR}_u du$$

## 2. Desk Modularization Targets (< 180 LOC, target < 150 LOC)
Five desk files identified near the 200 LOC ceiling:

1. `src/desk/risk/atr-trailing-stop.ts` (196 LOC)
   - Extract state & historical ATR queue into `src/desk/risk/atr-trailing-stop-state.ts` (~80 LOC).
   - Core trailing stop engine remains ~110 LOC.

2. `src/desk/feeds/market-data-multiplexer.ts` (196 LOC)
   - Extract feed subscription routing into `src/desk/feeds/market-data-multiplexer-router.ts` (~85 LOC).
   - Core multiplexer engine remains ~115 LOC.

3. `src/desk/daemon/desk-daemon.ts` (196 LOC)
   - Extract daemon lifecycle state and metrics into `src/desk/daemon/desk-daemon-state.ts` (~80 LOC).
   - Main daemon coordinator remains ~120 LOC.

4. `src/desk/arbitrage/risk/arbitrage-risk-guard.ts` (196 LOC)
   - Extract threshold checks & validation into `src/desk/arbitrage/risk/arbitrage-risk-evaluator.ts` (~80 LOC).
   - Guard orchestrator remains ~120 LOC.

5. `src/desk/feeds/polymarket-websocket-feed.ts` (195 LOC)
   - Extract heartbeat & message parser into `src/desk/feeds/polymarket-feed-protocol.ts` (~80 LOC).
   - Main feed client remains ~120 LOC.

## 3. Quality Standards & Quality Ratchet
- Strict TypeScript compile check (`npx tsc --noEmit`).
- Zero `:any` types.
- Pure Vitest test suites with zero mocks for analytical math.
