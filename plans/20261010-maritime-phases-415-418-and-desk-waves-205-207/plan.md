# Architectural Plan: Maritime Phases 415-418 & Quantitative Desk Waves 205-207

## Overview
Deep brainstorming and technical design for the next sprint:
- **Track 1 (`mekong-cli`)**: Maritime Automation Phases 415-418 (CPP & OD Box Hydraulics, Fuel Homogenizer & Emulsion, Cargo Hold Dewpoint & Desiccant Wheel, OMD & Crankcase Relief Valve).
- **Track 2 (`algo-trader`)**: Quantitative Desk Waves 205-207 (Hansen-Lunde Realized Kernel, Christensen-Oomen-Podolskij RQV, Bollerslev-Gibson-Zhou Variance Risk Premium).

---

## Track 1: Maritime Automation Phases 415-418 (`mekong-cli`)

### Phase 415: Propeller CPP & OD Box Hydraulics
- **Regulations**: DNV Pt.4 Ch.5, SOLAS II-1 Reg 28 / Reg 31.
- **Core Physics & Equations**:
  - Propeller pitch angle $\theta$ control loop via hydraulic piston differential pressure $\Delta P = P_A - P_B$.
  - Thrust force $T = \rho_w n^2 D^4 K_T(J, P/D)$ and torque $Q = \rho_w n^2 D^5 K_Q(J, P/D)$ where advance ratio $J = V_A / (n D)$.
  - Oil Distribution (OD) box dynamic seal leakage flow rate $q_{\text{leak}} = \frac{\pi d c^3 \Delta P}{12 \mu L} (1 + 1.5 \epsilon^2)$.
  - Mechanical lock-pin engagement for emergency ahead pitch hold (fail-safe ahead positioning).
- **File**: `src/core/maritime/phase_415_cpp_propeller_odbox_hydraulics.py` (< 200 LOC).

### Phase 416: Marine Fuel Homogenizer & Water Emulsification
- **Regulations**: MARPOL Annex VI Reg 14 / ISO 8217 Bunker Fuel Standards.
- **Core Physics & Equations**:
  - Rotor-stator hydrodynamic shear rate $\dot{\gamma} = \frac{\pi D N}{h}$ and Weber number $We = \frac{\rho v^2 d}{\sigma}$ controlling water droplet atomization ($d < 2\,\mu\text{m}$).
  - Water-in-fuel emulsion secondary micro-explosion mechanics: superheated water flash-boils within HFO droplet, shattering asphaltene agglomerates.
  - Temperature-viscosity loop control: Walther equation $\log\log(\nu + 0.7) = A - B \log(T)$ regulating PID steam heater valve to deliver $12-14\,\text{cSt}$ at engine inlet.
  - Flame peak temperature suppression reducing thermal NOx emissions by $10-15\%$.
- **File**: `src/core/maritime/phase_416_fuel_homogenizer_emulsion.py` (< 200 LOC).

### Phase 417: Cargo Hold Dew Point & Hold Dehumidification Desiccant Wheel
- **Regulations**: IMSBC Code (Bulk Cargo Sweat Prevention), DNV Rules for Cargo Care.
- **Core Physics & Equations**:
  - Psychrometric dew point calculation via Magnus-Tetens:
    $$T_{\text{dp}} = \frac{c \cdot \gamma(T, RH)}{b - \gamma(T, RH)}, \quad \gamma(T, RH) = \frac{b T}{c + T} + \ln(RH / 100)$$
  - Sweat risk index: compares Cargo Hold Dew Point $T_{\text{dp,hold}}$ against Ship Hull Temperature (approximated by Seawater Temp $T_{\text{sw}}$) and Ambient Air Dew Point $T_{\text{dp,amb}}$.
    - If $T_{\text{dp,hold}} > T_{\text{sw}}$: Ship sweat occurs on frames/decks.
    - If $T_{\text{dp,amb}} > T_{\text{cargo}}$: Cargo sweat occurs if outside ventilation is admitted $\rightarrow$ Seal hold & activate desiccant wheel.
  - Rotary silica-gel wheel moisture removal capacity: $W_{\text{rem}} = \dot{m}_{\text{air}} (w_{\text{in}} - w_{\text{out}})$ with thermal regeneration heater duty.
- **File**: `src/core/maritime/phase_417_cargo_hold_dewpoint_desiccant.py` (< 200 LOC).

### Phase 418: Crankcase Explosion Relief Valve & Oil Mist Detector (OMD)
- **Regulations**: SOLAS II-1 Reg 47, IACS M9 / M10 Standards for Marine Diesel Engines.
- **Core Physics & Equations**:
  - Optical obscuration and light absorption per Beer-Lambert law: $I = I_0 \exp(-\kappa_{\text{ext}} L)$, converting to oil mist concentration $C_{\text{mist}}\,\text{mg/L}$.
  - Primary alarm threshold: $C_{\text{mist}} \ge 1.0\,\text{mg/L}$ (or $5\%$ LEL of oil mist); Emergency shutdown/slowdown at $\ge 2.0\,\text{mg/L}$ ($10\%$ LEL).
  - Crankcase explosion flame arrester relief valve dynamics: valve lift pressure $P_{\text{lift}} = 0.20 \pm 0.05\,\text{bar}$, stainless steel wire mesh quenching thermal dissipation $q = \frac{k A \Delta T}{\delta}$.
  - Hotspot detection (main bearing, big-end bearing, crosshead guide) and auto-slowdown logic.
- **File**: `src/core/maritime/phase_418_crankcase_relief_oil_mist_detector.py` (< 200 LOC).

### Unified Facade, CLI & MCP
- **Master Facade**: `src/core/maritime_cpp_homogenizer_dewpoint_omd_engine.py` (< 200 LOC).
- **Typer CLI**: `src/cli/commands/maritime_cpp_homogenizer_dewpoint_omd_command.py` (< 200 LOC).
- **Bilingual Aliases**:
  - `cpppropeller` / `chanvithoavan`
  - `fuelhomogenizer` / `donghoanhietlieu`
  - `cargodewpoint` / `diemsuonghamhang`
  - `crankcaseomd` / `bododausuongcacte`
- **FastMCP Tools**: 4 tool functions registered in `scripts/mcp_server.py`.
- **Zero-Mock Unit Suite**: `tests/test_maritime_phases_415_418_unit_suite.py` (< 200 LOC).

---

## Track 2: Quantitative Desk Waves 205-207 (`algo-trader`)

### Wave 205: Hansen & Lunde (2006) Realized Kernel (`src/desk/realizedkernel/`)
- **Key Concepts**:
  - Non-parametric estimation of integrated variance in the presence of market microstructure noise:
    $$K(X) = \gamma_0 + \sum_{h=1}^H k\left(\frac{h-1}{H}\right)(\gamma_h + \gamma_{-h})$$
    where $\gamma_h = \sum_{j=1}^n x_j x_{j-h}$ are autocovariances of high-frequency log-returns $x_j$.
  - Modified Tukey-Hanning and Parzen kernels guaranteeing positive semi-definite estimates.
  - Optimal bandwidth selection $H^* = c^* \xi^{4/5} n^{3/5}$ where $\xi^2 = \omega^2 / \sqrt{IV}$.
- **Modules** (< 180 LOC each):
  - `realized-kernel-types.ts`: Intraday data series, autocovariances, kernel types, bandwidth parameters.
  - `realized-kernel-math.ts`: Autocovariances calculation, Parzen/Tukey-Hanning weighting, bandwidth estimation.
  - `realized-kernel-engine.ts`: `RealizedKernelEngine` processing raw tick/bar returns and returning noise-robust integrated variance.
  - `index.ts`: Public API export.
  - `tests/unit/desk/realizedkernel/realized-kernel.test.ts`: Zero-mock tests.

### Wave 206: Christensen, Oomen & Podolskij (2014) Realized Quantile Variance (RQV) (`src/desk/rqv/`)
- **Key Concepts**:
  - Microstructure noise and finite jump robust non-parametric variance estimator based on empirical quantiles:
    $$RQV_n(\alpha) = \frac{1}{\nu_1(\alpha)^2} \sum_{i=k}^n \left(q_{\alpha}(X_{i-k+1 \dots i}) - q_{1-\alpha}(X_{i-k+1 \dots i})\right)^2$$
  - Disentangles continuous diffusion from jump variation without requiring empirical jump truncation tuning parameter $\varpi$.
  - Test statistic for intra-day price jumps: $Z_{\text{jump}} = \frac{RV - RQV}{\sqrt{\text{AsyVar}}}$.
- **Modules** (< 180 LOC each):
  - `rqv-types.ts`: Rolling window return segments, quantile parameters, jump statistics, decomposition results.
  - `rqv-math.ts`: Quantile interpolation, rolling sub-sample sorting, scaling constant $\nu_1(\alpha)$, asymptotic variance.
  - `rqv-engine.ts`: `RealizedQuantileVarianceEngine` running quantile volatility filtering and jump extraction.
  - `index.ts`: Public API export.
  - `tests/unit/desk/rqv/rqv.test.ts`: Zero-mock tests.

### Wave 207: Bollerslev, Gibson & Zhou (2011) Variance Risk Premium (VRP) (`src/desk/vrp/`)
- **Key Concepts**:
  - Model-free Variance Risk Premium defined as difference between risk-neutral implied variance and objective physical expectation of realized variance:
    $$VRP_t = IV_t - \mathbb{E}_t[RV_{t+1}]$$
  - Model-Free Implied Variance (MFIV) computed across out-of-the-money puts and calls per CBOE / Britten-Jones & Neuberger (2000):
    $$IV_t = \frac{2 e^{r T}}{T} \left[ \int_0^F \frac{P(K)}{K^2} dK + \int_F^\infty \frac{C(K)}{K^2} dK \right]$$
  - Multi-period forecasting regression for equity risk premia:
    $$r_{t+h} - r_f = \alpha_h + \beta_h VRP_t + \epsilon_{t+h}$$
    yielding significant return predictability at quarterly horizons ($h = 1-3$ months).
- **Modules** (< 180 LOC each):
  - `vrp-types.ts`: Option strip inputs, realized variance series, risk-neutral vs physical expectations, regression metrics.
  - `vrp-math.ts`: CBOE MFIV numerical integration, AR(p) / HAR expectation for $\mathbb{E}_t[RV_{t+1}]$, OLS regression with Newey-West standard errors.
  - `vrp-engine.ts`: `VarianceRiskPremiumEngine` coordinating option surfaces, realized metrics, and premium forecast signals.
  - `index.ts`: Public API export.
  - `tests/unit/desk/vrp/vrp.test.ts`: Zero-mock tests.

---

## Acceptance Criteria & DoD
1. Every file strictly $< 180$ LOC (TypeScript) and $< 200$ LOC (Python).
2. Zero mocks, zero fake data, genuine physics & quantitative formulas.
3. Zero `:any` types in TypeScript, full typed models in Python dataclasses.
4. 100% test pass rate across all new test suites.
5. Typer CLI commands registered with 8 bilingual aliases.
6. FastMCP endpoints registered in `scripts/mcp_server.py`.
