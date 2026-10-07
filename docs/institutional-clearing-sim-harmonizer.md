# Institutional Simulation, Harmonizer & Clearing Stack Specification

## 1. Executive Architecture Overview
This document specifies the technical architecture, mathematical foundations, and strict TypeScript contracts for three unified trading desk packages:
1. **L3 Microstructure Simulation Suite** (`src/desk/simulation/`)
2. **Desk Harmonizer Pipeline** (`src/desk/harmonizer/`)
3. **Institutional Settlement & Margin Clearing Suite** (`src/desk/clearing/`)

---

## 2. Package 1: L3 Microstructure Simulation Suite
Provides sub-millisecond, discrete-event Level-3 exchange replay, Kyle's Lambda price impact estimation, and FIFO queue position fill modeling.

### Mathematical Formulations
- **Level-3 Order Event Set**: $\mathcal{E} \in \{\text{ADD}, \text{MODIFY}, \text{CANCEL}, \text{EXECUTE}\}$.
- **Kyle's Lambda & Almgren-Chriss Impact**:
  $$\Delta P_t = I_{\text{perm}}(Q_t) + I_{\text{temp}}(Q_t) + \eta_t$$
  - Permanent impact: $I_{\text{perm}}(Q_t) = \lambda \cdot Q_t$
  - Temporary impact: $I_{\text{temp}}(Q_t) = \text{sign}(Q_t) \cdot (\frac{\text{Spread}}{2} + \theta \sqrt{|Q_t|})$
- **FIFO Queue Volume Depletion with Jitter**:
  $$Q_{\text{ahead}}(t + \Delta t) = \max\left(0, Q_{\text{ahead}}(t) - V_{\text{exec}} - V_{\text{cancel\_ahead}}\right)$$
  - Latency jitter: $L \sim \text{LogNormal}(\mu_{\text{lat}}, \sigma^2_{\text{lat}})$.

### Modules (<= 200 LOC each)
- `src/desk/simulation/l3-event-types.ts`
- `src/desk/simulation/l3-orderbook-queue.ts`
- `src/desk/simulation/l3-orderbook-engine.ts`
- `src/desk/simulation/kyle-lambda-impact-types.ts`
- `src/desk/simulation/kyle-lambda-impact-model.ts`
- `src/desk/simulation/queue-fill-simulator-types.ts`
- `src/desk/simulation/queue-fill-simulator.ts`

---

## 3. Package 2: Desk Harmonizer Pipeline
Closed-loop event-driven state machine coordinating predictive alpha, toxicity defenses, dynamic quoting, multi-leg atomic routing, and AMM LVR delta hedging.

### Harmonization Feedback Cycle
1. **Alpha Ingestion**: Hayashi-Yoshida cross-correlation predicts short-term directional drift: $\hat{\Delta P}_{\text{drift}}$.
2. **Toxic Flow Modulation**: VPIN toxicity $\tau \in [0, 1]$ expands quote half-spread and scales inventory risk aversion $\gamma$.
3. **Avellaneda-Stoikov Quotes**: Calculates reservation prices and symmetric/asymmetric bid-ask spreads.
4. **SOR Atomic Bundling**: Dispatches multi-leg execution through `CombinatorialBundleRouter` with skew unwinding guards.
5. **LVR Delta Neutralization**: On execution fill, computes AMM liquidity pool delta displacement and issues balancing perp hedges via `LpLvrYieldSentinel`.

### Modules (<= 200 LOC each)
- `src/desk/harmonizer/desk-harmonizer-types.ts`
- `src/desk/harmonizer/desk-signal-aggregator.ts`
- `src/desk/harmonizer/as-quote-modulator.ts`
- `src/desk/harmonizer/bundle-execution-coordinator.ts`
- `src/desk/harmonizer/lvr-hedge-synchronizer.ts`
- `src/desk/harmonizer/desk-harmonizer-pipeline.ts`

---

## 4. Package 3: Settlement, Margin & Collateral Clearing Suite
Atomic cross-venue delivery-versus-payment settlement, multi-scenario binary portfolio margin calculation, and counterparty credit risk monitoring.

### Mathematical Formulations
- **Atomic Delivery-versus-Payment (DvP)**:
  - Multi-phase state machine: $\text{Created} \to \text{EscrowLocked} \to \text{Executing} \to \text{Settled}$ (with deterministic timeout rollback to $\text{Refunded}$).
- **SPAN Binary Portfolio Margin**:
  - Scenario evaluation surface across underlying outcome probabilities $p \in [0, 1]$ and implied volatility shocks $\Delta \sigma$:
    $$L_s = \sum_{i=1}^N \max(0, -\Delta V_i(s)), \quad \text{InitialMargin} = \max_{s \in S}(L_s) \times (1 + \lambda_{\text{buffer}})$$
    $$\text{MaintenanceMargin} = 0.70 \times \text{InitialMargin}$$
- **Counterparty Credit Risk & Haircut Sentinel**:
  - Current Exposure $\text{CE}_c = \max(0, \sum \text{MtM} - C_{\text{held}})$.
  - Potential Future Exposure $\text{PFE}_{99\%}(T) = \text{MtM}_0 + \mu_T + 2.326 \cdot \sigma \sqrt{T}$.
  - Dynamic Collateral Haircut with Wrong-Way Risk (WWR) multiplier.

### Modules (<= 200 LOC each)
- `src/desk/clearing/dvp-settlement-types.ts`
- `src/desk/clearing/dvp-settlement-relayer.ts`
- `src/desk/clearing/portfolio-margin-types.ts`
- `src/desk/clearing/portfolio-margin-engine.ts`
- `src/desk/clearing/counterparty-credit-types.ts`
- `src/desk/clearing/counterparty-credit-sentinel.ts`

---

## 5. Strict Quality Invariants
1. Zero `:any` types and zero `eslint-disable` annotations.
2. Every source file strictly $\le 200$ LOC.
3. 100% green tests in Vitest with exhaustive boundary conditions.
4. Clean TypeScript compilation with `tsc --noEmit`.
