# Deep Brainstorming: Maritime Automation Phases 423-426 & Quantitative Waves 211-213

**Date:** 2026-10-10  
**Status:** Architecture Blueprint & Implementation Specification  
**Methodology:** Autonomous Parallel Bootstrap (`/bootstrap:auto:parallel` → `/brainstorming --deep`)  
**Quality Standards:** Strictly < 180 LOC per file, zero mocks, real mathematical & physical models, zero `:any` types, 100% green tests.

---

## 1. Track 1: Maritime Automation Phases 423–426 (mekong-cli)

### Phase 423: Marine Economizer Automated Soot Water Washing & Fire Prevention
- **International Regulations & Class Rules:**
  - IMO MARPOL Annex VI Reg 13/14, MEPC.340(77).
  - IACS Unified Requirement M53 (Boilers and Pressure Vessels).
  - DNV Rules for Ships Pt.4 Ch.6 Sec.6 (Exhaust Gas Boilers).
- **Physical & Thermodynamic Model:**
  - **Exhaust Gas Differential Pressure Drop:**
    $$\Delta P_{\text{economizer}} = \zeta_{\text{tube}} \cdot \frac{1}{2} \rho_{\text{gas}} v_{\text{gas}}^2 \cdot \left(1 + \kappa_{\text{soot}} \cdot \frac{m_{\text{soot}}}{A_{\text{surface}}}\right)$$
    Clean benchmark $\Delta P_0 \in [1.2, 1.8]\text{ kPa}$. Warning threshold at $\Delta P \ge 2.5\text{ kPa}$; mandatory soot blow/wash at $\ge 3.2\text{ kPa}$.
  - **Soot Fire Auto-Ignition Thermal Runaway:**
    - Soot auto-ignition temperature $T_{\text{ignition}} \approx 380\text{--}400^\circ\text{C}$ in oxygen-rich diesel exhaust ($\text{O}_2 \approx 13\text{--}15\%$).
    - Critical rate of temperature rise $\frac{dT_{\text{gas}}}{dt} \ge 10.0^\circ\text{C/min}$ triggers immediate soot fire pre-alarm.
    - Exhaust gas temperature $T_{\text{exhaust}} \ge 400^\circ\text{C}$ trips emergency fire alarm, initiates main engine slowdown/stop, isolates exhaust dampers, and starts water mist/drenching fire extinguishing.
  - **Soot Washing Washwater Neutralization:**
    - Acidic condensate containing sulfurous soot ($H_2SO_3 / H_2SO_4$, $\text{pH} \approx 2.0\text{--}3.5$).
    - Automated neutralizing dosing with sodium hydroxide ($\text{NaOH}$) targeting discharge holding tank $\text{pH} \in [6.5, 8.5]$.

---

### Phase 424: Thermal Oil Heater & Expansion Tank Closed-Loop Control
- **International Regulations & Class Rules:**
  - DIN 4754 (Heat Transfer Installations with Organic Heat Transfer Liquids).
  - ISO 5149 & DNV-RU-SHIP Pt.4 Ch.6 Sec.7 (Thermal Oil Systems).
- **Thermodynamic & Fluid Dynamic Model:**
  - **Boundary Film Temperature Limit:**
    $$T_{\text{film}} = T_{\text{bulk}} + \frac{q''}{\alpha_{\text{convection}}} \le T_{\text{max,film}} \approx 340^\circ\text{C}$$
    Where $T_{\text{bulk}} \le 280^\circ\text{C}$ for standard synthetic/mineral thermal fluids.
  - **Minimum Flow Velocity & Reynolds Number:**
    $$Re = \frac{v \cdot d_{\text{inner}}}{\nu_{\text{oil}}} \ge 10,000 \quad (\text{fully turbulent flow})$$
    Differential pressure interlock $\Delta P_{\text{coil}} \ge 1.5\text{ bar}$ ensures no laminar stagnant overheating.
  - **Nitrogen ($\text{N}_2$) Blanket Expansion Tank:**
    - Expansion tank volume:
      $$V_{\text{exp}} \ge 1.3 \cdot V_{\text{system}} \cdot \beta \cdot \Delta T$$
      Where $\beta \approx 0.0008\text{ K}^{-1}$ thermal expansion coefficient.
    - Inert $\text{N}_2$ cushion pressure $P_{\text{N2}} \in [0.2, 0.5]\text{ bar}$ prevents atmospheric oxygen ingress and thermal oil oxidation degradation.
    - Minimum expansion tank level interlock ($L_{\text{tank}} < 20\%$ trips burner).

---

### Phase 425: Bilge Water Vacuum Evaporator & Concentrated Sludge Distillation
- **International Regulations & Class Rules:**
  - IMO MARPOL Annex I Regulation 15 (Control of Discharge of Oil).
  - IMO Resolution MEPC.107(49).
- **Thermodynamic Model & Vacuum Kinetics:**
  - **Sub-Atmospheric Boiling Point Reduction:**
    Using the Antoine vapor pressure formulation for water:
    $$\log_{10}(P) = A - \frac{B}{T + C} \implies T_{\text{boil}}(P_{\text{vac}})$$
    At absolute pressure $P_{\text{vac}} \in [0.10, 0.20]\text{ bar}$ (vacuum $-0.80$ to $-0.90\text{ bar}$ gauge), boiling occurs at $T \in [45^\circ\text{C}, 60^\circ\text{C}]$, utilizing engine jacket cooling waste heat ($T_{\text{HT}} \approx 80^\circ\text{C}$).
  - **Distillation Mass Balance & Volume Reduction:**
    $$\dot{m}_{\text{distillate}} = \dot{m}_{\text{feed}} \cdot (1 - x_{\text{sludge}}) \cdot \eta_{\text{condenser}}$$
    Produces clean distillate oil content $\le 5.0\text{ ppm}$ (well below MARPOL 15 ppm limit) and concentrated oily sludge ($> 60\%\text{ oil}$) directed to the ship's sludge incinerator or port reception facility.
  - **VOC Demister & Overfoaming Prevention:**
    Differential pressure sensor across demister pad $\Delta P_{\text{demister}} \le 20\text{ mbar}$; optical foam sensor detects foaming and injects silicone anti-foaming agent.

---

### Phase 426: Crankcase Explosion Relief Valve & Gravimetric Oil Mist Detector
- **International Regulations & Class Rules:**
  - IACS Unified Requirement M9 (Crankcase Explosion Relief Valves).
  - IACS Unified Requirement M10 (Protection of Internal Combustion Engines against Crankcase Explosions).
  - SOLAS II-1 Regulation 27.5 & ISO 10816-6.
- **Gas Dynamics & Optical Gravimetric Sensing:**
  - **Crankcase Relief Valve Venting Area:**
    $$A_{\text{relief}} \ge \frac{V_{\text{crankcase}}}{0.02}\text{ cm}^2 \quad (\text{IACS M9 minimum discharge area requirement})$$
    Spring-loaded opening pressure $P_{\text{open}} \approx 0.2 \pm 0.05\text{ bar}$, flame arrester gauze mesh capable of quenching $1100^\circ\text{C}$ oil-air flame fronts.
  - **Gravimetric Oil Mist Optical Extinction:**
    According to the Beer-Lambert law:
    $$I = I_0 \cdot e^{-\kappa \cdot C_{\text{mist}} \cdot L_{\text{path}}}$$
    Where $C_{\text{mist}}$ is oil mist concentration in $\text{mg/L}$.
    - Lower alarm threshold: $C_{\text{mist}} \ge 1.0\text{ mg/L}$ ($0.5\%\text{ LEL}$).
    - Emergency trip threshold: $C_{\text{mist}} \ge 2.0\text{ mg/L}$ (initiates automatic main engine slowdown or stop within $10\text{ s}$).
  - **Bearing Temperature Corroboration:**
    Cross-checks with main bearing thermocouple signals ($\Delta T \ge 15.0^\circ\text{C}$ above mean) to pinpoint overheated friction zones before detonation.

---

## 2. Track 2: Quantitative Desk Waves 211–213 (algo-trader)

### Wave 211: Corsi (2009) Heterogeneous Autoregressive Volatility (HAR-RV)
- **Academic Foundation:**
  - Fulvio Corsi (2009), "A Simple Approximate Long-Memory Model of Realized Volatility", *Journal of Financial Econometrics*, 7(2), 174–196.
- **Mathematical Specification:**
  - Multi-component realized volatility cascade across heterogeneous trading horizons:
    $$RV_{t+1d}^{(d)} = c + \beta^{(d)} RV_t^{(d)} + \beta^{(w)} RV_t^{(w)} + \beta^{(m)} RV_t^{(m)} + \epsilon_{t+1d}$$
    Where:
    $$RV_t^{(d)} = RV_t, \quad RV_t^{(w)} = \frac{1}{5} \sum_{i=0}^4 RV_{t-i}, \quad RV_t^{(m)} = \frac{1}{22} \sum_{i=0}^{21} RV_{t-i}$$
  - **Ordinary Least Squares (OLS) Closed-Form Solver:**
    Multi-variate regression with design matrix $X = [1, RV^{(d)}, RV^{(w)}, RV^{(m)}]$:
    $$\hat{\beta} = (X^T X)^{-1} X^T Y$$
  - **Persistence & Long Memory:**
    $\sum \beta_i \approx 0.95\text{--}0.99$, capturing long-memory hyperbolic decay without fractional integration.
- **Architecture (`src/desk/harrv/`):**
  - `harrv-types.ts` (< 40 LOC).
  - `harrv-math.ts` (< 90 LOC): rolling multi-horizon averages, OLS regression matrix math, $R^2$ goodness-of-fit.
  - `harrv-engine.ts` (< 85 LOC): calibration, forward 1-day/5-day/22-day volatility forecasting, regime classification.
  - `index.ts` (< 15 LOC).

---

### Wave 212: Corsi, Pirino & Reno (2010) Threshold Bipower Variation (T-BPV)
- **Academic Foundation:**
  - Corsi, Pirino & Reno (2010), "Threshold Bipower Variation and the Impact of Jumps on Volatility Forecasting", *Journal of Econometrics*, 159(2), 276–288.
- **Mathematical Specification:**
  - Eliminates the jump contamination of standard bipower variation:
    $$T\text{-}BV = \mu_1^{-2} \sum_{i=2}^N |r_i| \cdot |r_{i-1}| \cdot \mathbf{1}_{\{|r_i|^2 \le \Theta_i\}} \cdot \mathbf{1}_{\{|r_{i-1}|^2 \le \Theta_{i-1}\}}$$
    Where $\mu_1 = \sqrt{2/\pi} \approx 0.79788$, and the threshold function is:
    $$\Theta_i = c_\Theta^2 \cdot \hat{V}_i$$
    With local variance estimate $\hat{V}_i$ and multiplier $c_\Theta \approx 3.0$.
  - **Disentangled Jump Detection:**
    $$J_t = \max(RV_t - T\text{-}BV_t, 0)$$
    Test statistic $Z_{\text{jump}} = \frac{RV_t - T\text{-}BV_t}{\sqrt{\text{Var}(T\text{-}BV)}} \sim \mathcal{N}(0, 1)$.
- **Architecture (`src/desk/tbpv/`):**
  - `tbpv-types.ts` (< 40 LOC).
  - `tbpv-math.ts` (< 90 LOC): threshold function calculation, truncated bipower summation, jump test statistic.
  - `tbpv-engine.ts` (< 85 LOC): continuous vs jump decomposition, statistical significance tests, alert regime.
  - `index.ts` (< 15 LOC).

---

### Wave 213: Bollerslev, Gibson & Zhou (2011) Dynamic Variance Risk Premium (VRP)
- **Academic Foundation:**
  - Bollerslev, Gibson & Zhou (2011), "Dynamic Estimation of Volatility Risk Premia and Investor Risk Aversion from Option-Implied and Realized Volatilities", *Journal of Econometrics*, 160(1), 235–245.
- **Mathematical Specification:**
  - Variance Risk Premium:
    $$VRP_t = IV_t^2 - \mathbb{E}_t[RV_{t, t+\Delta t}]$$
    Where $IV_t^2$ is the risk-neutral expected variance (e.g. CBOE VIX$^2$) and $\mathbb{E}_t[RV]$ is the objective physical expectation estimated via HAR-RV or GARCH.
  - **Relative Risk Aversion (RRA) Extraction:**
    Under power utility $U(W) = \frac{W^{1-\gamma}}{1-\gamma}$, the instantaneous risk aversion coefficient:
    $$\gamma_t \propto \frac{VRP_t}{\text{Cov}_t(R_{m, t+1}, \sigma_{m, t+1}^2)}$$
  - **Equity Return Predictability:**
    $$R_{t+k} - R_{f} = \alpha + \beta_{\text{vrp}} \cdot VRP_t + \epsilon_{t+k}$$
    VRP exhibits positive predictive power for future 1-to-4 month equity risk premia.
- **Architecture (`src/desk/dynamicvrp/`):**
  - `dynamicvrp-types.ts` (< 40 LOC).
  - `dynamicvrp-math.ts` (< 90 LOC): variance premium spread, return forecasting regressions, risk aversion ratio.
  - `dynamicvrp-engine.ts` (< 85 LOC): forward return projection, market risk appetite index, trading posture recommendations.
  - `index.ts` (< 15 LOC).
