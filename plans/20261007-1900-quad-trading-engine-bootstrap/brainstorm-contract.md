# Brainstorm Contract: Quad Trading Engine Bootstrap

## 1. Outcome
Implement four mission-critical prediction market trading and risk engines:
1. **Cross-Venue Arb Engine**: Scans Polymarket, Kalshi, and Limitless normalized order books to detect risk-free and statistical cross-market mispricings after gas and fees.
2. **Automated Delta Hedger**: Calculates portfolio delta across binary event outcomes and emits compensatory balancing orders to maintain delta neutrality within tolerance thresholds.
3. **Portfolio Kelly Sizing Engine**: Computes fractional Kelly sizing with covariance shrinkage and Black-Litterman subjective view blending under portfolio NAV constraints.
4. **Oracle Settlement & Dispute Watcher**: Ingests UMA Optimistic Oracle and Chainlink event resolution proposals, identifies pending disputes, and triggers pre-settlement claim actions.

## 2. Hard Constraints
- Maximum 200 LOC per file in `src/`.
- Zero `:any` types.
- Zero ESLint disables.
- 100% test pass rate with real deterministic calculations (no mock cheats).
- Quality Ratchet 12/12 baseline compliance.

## 3. Non-Goals
- Real money on-chain transaction broadcast (mock private keys/mock RPCs only in tests).
- Modifying historical migration scripts.

## 4. Acceptance Criteria
- Full TypeScript type-checking (`tsc --noEmit`) passes with 0 errors.
- Unit test suites for each of the 4 engines with 100% green status.
- `scripts/check-quality-baseline.mjs` passes 12/12 checks.
