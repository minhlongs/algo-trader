# Plan: Maritime Phases 403-406 & Quantitative Desk Waves 196-198

## Track 1: Algo-Trader Quantitative Desk Waves 196-198
- **Wave 196: Nelson (1991) EGARCH (Exponential GARCH)** (`src/desk/egarch/`):
  - `egarch-types.ts`: Types for parameters, returns, conditional variance, leverage coefficient, log-likelihood.
  - `egarch-math.ts`: Exponential variance recurrence $\ln(\sigma_t^2) = \omega + \beta \ln(\sigma_{t-1}^2) + \alpha (|z_{t-1}| - \sqrt{2/\pi}) + \gamma z_{t-1}$.
  - `egarch-calibrator.ts`: Quasi-Maximum Likelihood Optimization via coordinate descent / numerical scoring.
  - `egarch-engine.ts`: `EgarchVolatilityEngine` fitting and multi-step term structure forecasting.
  - `index.ts`: Barrel export.
  - `tests/unit/desk/egarch/egarch.test.ts`: Zero-mock tests.
- **Wave 197: Engle (2002) DCC-GARCH (Dynamic Conditional Correlation)** (`src/desk/dccgarch/`):
  - `dcc-types.ts`: Types for multi-asset returns, standardized residuals, Q matrices, dynamic correlation matrices R, dynamic covariance matrices H.
  - `dcc-math.ts`: DCC recurrence relation, unconditional correlation calculation, eigenvalue / positive-definiteness clipping, scaling to correlation matrix.
  - `dcc-calibrator.ts`: Two-step QMLE estimator for DCC parameters $\alpha_{\text{dcc}}, \beta_{\text{dcc}}$ subject to $\alpha + \beta < 1$.
  - `dcc-engine.ts`: `DccGarchEngine` coordinating univariate GARCH standardized residuals, time-varying correlation paths, and dynamic portfolio minimum-variance hedge ratios.
  - `index.ts`: Barrel export.
  - `tests/unit/desk/dccgarch/dccgarch.test.ts`: Zero-mock tests.
- **Wave 198: Barndorff-Nielsen & Shephard (2004) BPV & Jump Disentanglement** (`src/desk/bipower/`):
  - `bipower-types.ts`: High-frequency intraday return series, Realized Variance (RV), Bipower Variation (BV), Tri-power Quarticity (TPQ), Jump Z-score, Jump Proportion.
  - `bipower-math.ts`: Exact BV estimator with $\mu_1^{-2} = \pi/2$, TPQ estimator, jump component extraction, and asymptotic Gaussian Z-statistic.
  - `bipower-engine.ts`: `BiPowerVariationEngine` computing daily/intraday jump decomposition, jump day classification, and continuous vs jump volatility components.
  - `index.ts`: Barrel export.
  - `tests/unit/desk/bipower/bipower.test.ts`: Zero-mock tests.

## Track 2: Mekong CLI Maritime Automation Phases 403-406
- **Phase 403**: `boiler_water_chemistry.py` (Coordinated phosphate-pH balance, hydrazine scavenger, TDS blowdown)
- **Phase 404**: `stern_tube_eal.py` (US EPA VGP 2013 bio-lubricant water ingress, seal differential pressure)
- **Phase 405**: `incinerator_sludge.py` (IMO MEPC.76(40) chamber temperature, sludge viscosity, flue gas limits)
- **Phase 406**: `sewage_treatment_mbr.py` (IMO MEPC.227(64) membrane bioreactor, BOD5/COD/TSS/coliforms, nutrients)
- **Facade Engine**: `maritime_boiler_tube_incinerator_stp_engine.py` (Composite assessment)
- **MCP Integration**: FastMCP tool registrations in `scripts/mcp_server.py`
- **Unit Tests**: `tests/test_maritime_boiler_tube_incinerator_stp.py`

## Rules & Constraints
- Strictly < 180 LOC per file
- Zero `:any` types
- Zero fake mocks
- 100% test pass rate
