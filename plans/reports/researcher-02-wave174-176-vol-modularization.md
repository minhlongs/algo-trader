# Quantitative Volatility & Architectural Modularization Research: Wave 174-176

## 1. Garman-Klass (1980) & Parkinson (1980) Volatility Engine
Continuous-time geometric Brownian motion range-based variance estimators:

### Parkinson (1980) High-Low Estimator:
$$\sigma_P^2 = \frac{1}{4 \ln 2 \cdot N} \sum_{t=1}^N \left(\ln \frac{H_t}{L_t}\right)^2$$
Efficiency factor: ~5.2x more efficient than traditional close-to-close sample variance.

### Garman-Klass (1980) OHLC Estimator:
$$\sigma_{GK}^2 = \frac{1}{N} \sum_{t=1}^N \left[ 0.5 \left(\ln \frac{H_t}{L_t}\right)^2 - (2\ln 2 - 1) \left(\ln \frac{C_t}{O_t}\right)^2 \right]$$
Efficiency factor: ~7.4x more efficient than standard sample variance.

### Garman-Klass-Yang-Zhang (GKYZ) Extension:
Incorporates overnight jumps between previous close $C_{t-1}$ and open $O_t$:
$$\sigma_{GKYZ}^2 = \frac{1}{N} \sum_{t=1}^N \left[ \left(\ln \frac{O_t}{C_{t-1}}\right)^2 + 0.5 \left(\ln \frac{H_t}{L_t}\right)^2 - (2\ln 2 - 1) \left(\ln \frac{C_t}{O_t}\right)^2 \right]$$

## 2. Modularization Strategy for Fat Files (<150 LOC target, <200 LOC hard ceiling)
Target 1: `src/platform/api/routes/leaderboard-routes.ts` (199 LOC)
- Extract CSV parsing, accuracy merging, and leaderboard building into `src/platform/api/routes/leaderboard-builder.ts` (~85 LOC).
- Leave express router in `leaderboard-routes.ts` (~75 LOC).

Target 2: `src/platform/risk/drawdown-monitor-evaluators.ts` (199 LOC)
- Extract alert formatting, label helpers, alert builder, and throttling into `src/platform/risk/drawdown-monitor-alerts-eval.ts` (~70 LOC).
- Keep core pure mathematical threshold evaluators in `drawdown-monitor-evaluators.ts` (~120 LOC).

## 3. Quality Ratchet & Standards
- Zero `:any` types.
- Zero ESLint suppressions.
- Pure mathematical formulas and exact assertions in Vitest suites.
