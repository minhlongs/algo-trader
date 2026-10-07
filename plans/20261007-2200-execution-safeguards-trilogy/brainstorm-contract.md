# Brainstorm Contract: Execution Safeguards Trilogy

## 1. Intended Product Outcome
Deliver an enterprise-grade execution, protection, and market-making triad tailored specifically for prediction markets (binary contracts with bounded prices $[0, 1]$):
1. **Prediction Market Smart Order Router (SOR)** (`pm-sor-engine.ts`):
   - Multi-venue price ladder aggregation across Polymarket, Kalshi, and Limitless.
   - Water-filling volume split algorithm minimizing effective weighted average execution price including venue taker fees.
   - Child-order slicing (TWAP / Iceberg) when order size exceeds top-of-book depth ratio.
2. **Real-Time Circuit Breaker & Liquidation Safeguard** (`circuit-breaker-safeguard.ts`):
   - Portfolio-level rolling drawdown limit detection and rapid trade halt state machine (`NORMAL` -> `TRIPPED` -> `RECOVERY`).
   - Oracle anomaly and sudden spread expansion triggers that halt execution and emit emergency cancel/unwind signals.
   - Margin health check preventing account leverage from exceeding safety thresholds.
3. **Autonomous Dynamic LP & Inventory Skew Engine** (`dynamic-lp-engine.ts`):
   - Continuous two-sided quotation generation (bid/ask around fair probability price).
   - Avellaneda-Stoikov inspired inventory skew: penalizes accumulating one-sided exposure by shading prices inward or outward.
   - Toxic flow spread widening when adverse selection or volatility spikes are detected.

## 2. Constraints
- **File Size Management**: Every newly created or modified source code file in `src/` MUST remain strictly $\le 200$ lines of code (LOC).
- **Zero `:any` Types**: Strict TypeScript typing across all models, parameters, and interfaces.
- **Zero ESLint Disables**: No `eslint-disable` comments.
- **Quality Ratchet Standards**: Branch coverage $\ge 86\%$, line coverage $\ge 95\%$, 100% test pass rate with 0 failures.
- **No Mock Hacks**: Real logic, deterministic test cases, pure algorithms, and comprehensive boundary condition tests.

## 3. Non-Goals
- Real money RPC broadcasting or live private key storage in this repository layer (handled by downstream custodial signer workers).
- Replacing the general crypto SOR in `src/desk/sor/` (this engine is specifically specialized for binary $[0, 1]$ prediction contracts with outcome parity and fee structures).

## 4. Observable Acceptance Criteria
1. `pm-sor-engine.ts` correctly routes orders across multiple venues, splitting across venue books when depth on a single venue causes higher marginal cost than secondary venues.
2. `circuit-breaker-safeguard.ts` trips immediately upon experiencing drawdown $> \text{maxDrawdownThreshold}$ or volatility ratio $> \text{volatilitySpikeThreshold}$, transition to `TRIPPED` state and producing cancel orders.
3. `dynamic-lp-engine.ts` calculates two-sided quotes where quotes skew asymmetric when inventory is positive (lowering bids, lowering asks) or negative (raising bids, raising asks).
4. All unit tests pass with 0 failures, 100% test green, and Quality Ratchet gate metrics verified.
