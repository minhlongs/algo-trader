# Tech Stack & Mathematical Specification: Wave 174-176

## 1. Executive Summary
Wave 174-176 delivers three quant finance desks and architectural deep modularization of platform routes and risk evaluators, adhering to the Quality Ratchet v1.1.0 standard (<200 LOC per file, zero `:any` types, zero ESLint suppressions).

## 2. Quantitative Desk Specifications

### Desk 174: Turnbull-Wakeman (1991) Arithmetic Asian Option Valuation Engine
- **Mathematical Foundation**: Edgeworth series approximation matching first two analytical moments:
  $$M_1 = \frac{e^{bT}-1}{bT} S_0$$
  $$M_2 = \frac{2S_0^2}{(b+\sigma^2)T^2} \left[ \frac{e^{(2b+\sigma^2)T}-1}{2b+\sigma^2} - \frac{e^{bT}-1}{b} \right]$$
  $$\sigma_A = \sqrt{\frac{\ln(M_2) - 2\ln(M_1)}{T}}$$
- **Put-Call Parity**: $C - P = e^{-rT}(M_1 - K)$ strictly preserved (<1e-10 deviation).
- **Files**: `src/desk/turnbullwakeman/turnbullwakeman-{types,math,engine}.ts`, `index.ts`.

### Desk 175: Hull-White (1990) Analytical Short-Rate & European Bond Option Engine
- **Mathematical Foundation**: One-factor affine term structure model:
  $$dr_t = (\theta(t) - a r_t) dt + \sigma dW_t$$
  $$P(t, T) = A(t, T) e^{-B(t, T) r_t}, \quad B(t, T) = \frac{1 - e^{-a(T-t)}}{a}$$
  Analytical European bond options with Black-type valuation on forward zero-coupon bonds.
- **Files**: `src/desk/hullwhite/hullwhite-{types,math,engine}.ts`, `index.ts`.

### Desk 176: Garman-Klass (1980) & Parkinson (1980) Range Volatility Engine
- **Mathematical Foundation**: Extreme-value estimators utilizing intra-period price ranges:
  $$\sigma_P^2 = \frac{1}{4 \ln(2) \cdot N} \sum_{i=1}^N \left(\ln \frac{H_i}{L_i}\right)^2 \quad (\sim 5.2\times \text{ efficiency})$$
  $$\sigma_{GK}^2 = \frac{1}{N} \sum_{i=1}^N \left[ 0.5 \left(\ln \frac{H_i}{L_i}\right)^2 - (2\ln 2 - 1) \left(\ln \frac{C_i}{O_i}\right)^2 \right] \quad (\sim 7.4\times \text{ efficiency})$$
- **Files**: `src/desk/garmanklass/garmanklass-{types,math,engine}.ts`, `index.ts`.

## 3. Platform Modularization
- `src/platform/api/routes/leaderboard-routes.ts`: Refactored from 199 LOC to 77 LOC by extracting CSV and scoring logic to `leaderboard-builder.ts` (129 LOC).
- `src/platform/risk/drawdown-monitor-evaluators.ts`: Refactored from 199 LOC to 158 LOC by extracting alert formatting and throttling to `drawdown-monitor-alerts-eval.ts` (58 LOC).
