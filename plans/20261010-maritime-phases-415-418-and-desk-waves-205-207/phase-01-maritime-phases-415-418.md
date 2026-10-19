# Phase 01: Maritime Automation Phases 415-418

## Overview
Implement 4 specialized marine propulsion, fuel, environmental and engine safety engineering modules in `mekong-cli`:
- **Phase 415**: Controllable Pitch Propeller (CPP) & Oil Distribution (OD) Box Hydraulics (`phase_415_cpp_propeller_odbox_hydraulics.py`)
- **Phase 416**: Marine Fuel Homogenizer & Water Emulsification (`phase_416_fuel_homogenizer_emulsion.py`)
- **Phase 417**: Cargo Hold Dew Point & Desiccant Wheel Dehumidification (`phase_417_cargo_hold_dewpoint_desiccant.py`)
- **Phase 418**: Crankcase Explosion Relief Valve & Oil Mist Detector (OMD) (`phase_418_crankcase_relief_oil_mist_detector.py`)

## Specifications & Mathematical Models

### Phase 415: Propeller CPP & OD Box Hydraulics
- **Standards**: DNV Pt.4 Ch.5, SOLAS II-1 Reg 28 / Reg 31.
- **Physical Modeling**:
  - Propeller open water thrust $T = \rho_w n^2 D^4 K_T(J, P/D)$ and torque $Q = \rho_w n^2 D^5 K_Q(J, P/D)$, with $J = V_A / (n D)$.
  - Pitch servo cylinder pressure differential: $\Delta P = P_{\text{ahead}} - P_{\text{astern}}$.
  - OD box shaft concentric annular dynamic clearance leakage: $q = \frac{\pi d c^3 \Delta P}{12 \mu L} (1 + 1.5 \epsilon^2)$.
  - Lock-pin emergency ahead positioning (fail-safe mechanical engagement if hydraulic control pressure drops $< 15\,\text{bar}$).
- **Target File**: `src/core/maritime/phase_415_cpp_propeller_odbox_hydraulics.py` (< 200 LOC).

### Phase 416: Marine Fuel Homogenizer & Water Emulsification
- **Standards**: MARPOL Annex VI Reg 14, ISO 8217.
- **Physical Modeling**:
  - Rotor-stator shear rate $\dot{\gamma} = \frac{\pi D N}{h}$ and Weber number $We = \frac{\rho v^2 d}{\sigma}$.
  - Fuel-water emulsion secondary micro-explosion: superheated water flash vaporization shatters heavy fuel oil (HFO) droplets into sub-micron droplets ($< 2\,\mu\text{m}$).
  - Viscosity control loop via Walther equation: $\log\log(\nu + 0.7) = A - B \log(T)$, modulating steam trace heating to maintain target engine injection viscosity ($12-14\,\text{cSt}$).
  - Flame peak temperature suppression reducing thermal NOx emissions by up to $15\%$.
- **Target File**: `src/core/maritime/phase_416_fuel_homogenizer_emulsion.py` (< 200 LOC).

### Phase 417: Cargo Hold Dew Point & Desiccant Wheel Dehumidification
- **Standards**: IMSBC Code (Bulk Cargo Sweat Prevention), DNV Rules for Cargo Care.
- **Physical Modeling**:
  - Magnus-Tetens dew point calculation:
    $$T_{\text{dp}} = \frac{c \cdot \gamma(T, RH)}{b - \gamma(T, RH)}, \quad \gamma = \frac{b T}{c + T} + \ln(RH / 100)$$
  - Sweat risk index:
    - Hold Dew Point vs Hull/Seawater temperature $\Delta T_{\text{ship sweat}} = T_{\text{dp,hold}} - T_{\text{sw}}$.
    - Ambient Dew Point vs Cargo temperature $\Delta T_{\text{cargo sweat}} = T_{\text{dp,amb}} - T_{\text{cargo}}$.
    - Ventilation advisory: Seal hold and activate desiccant wheel when $T_{\text{dp,amb}} > T_{\text{cargo}}$ or rain/fog outside.
  - Rotary silica-gel wheel moisture extraction: $W = \dot{m}_{\text{air}} (w_{\text{in}} - w_{\text{out}})$ with thermal regeneration duty.
- **Target File**: `src/core/maritime/phase_417_cargo_hold_dewpoint_desiccant.py` (< 200 LOC).

### Phase 418: Crankcase Explosion Relief Valve & Oil Mist Detector (OMD)
- **Standards**: SOLAS II-1 Reg 47, IACS M9 / M10.
- **Physical Modeling**:
  - Beer-Lambert optical extinction: $I = I_0 \exp(-\kappa_{\text{ext}} L)$, oil mist density $C_{\text{mist}} = -\frac{1}{\kappa_0 L} \ln(I / I_0)$.
  - Alarm limits:
    - Normal: $< 0.5\,\text{mg/L}$.
    - Pre-warning (high mist / bearing friction hotspot): $\ge 1.0\,\text{mg/L}$ ($5\%$ LEL).
    - Emergency shutdown / engine auto-slowdown: $\ge 2.0\,\text{mg/L}$ ($10\%$ LEL).
  - Spring-loaded flame arrester relief valve lift: $P_{\text{lift}} = 0.20 \pm 0.05\,\text{bar}$, heat dissipation mesh quenching.
- **Target File**: `src/core/maritime/phase_418_crankcase_relief_oil_mist_detector.py` (< 200 LOC).

## Checklist
- [ ] Implement Phase 415 in `mekong-cli`
- [ ] Implement Phase 416 in `mekong-cli`
- [ ] Implement Phase 417 in `mekong-cli`
- [ ] Implement Phase 418 in `mekong-cli`
- [ ] Verify each file is strictly < 200 LOC with zero mocks and typed models.
