# Tech Stack & Architecture: Maritime Phases 403-406 & Desk Waves 196-198

## 1. System Overview & Architectural Seams
Dual-track continuous integration uniting heavy maritime engineering automation and high-frequency quantitative market microstructure:
- **Maritime Automation (`mekong-cli`)**: Python 3.12+, Pydantic v2, FastMCP (Model Context Protocol), strictly typed with complete domain immutability.
- **Quantitative Desk (`algo-trader`)**: TypeScript 5.5+, Node.js 22+, Vitest, zero external runtime math dependencies, analytical closed-form numerical solvers.

---

## 2. Quantitative Desk Stack (Waves 196-198)
- **Language & Runtime**: TypeScript 5.5+ (strict mode, noImplicitAny, exactOptionalPropertyTypes).
- **Architecture**:
  - `src/desk/egarch/`: Nelson (1991) EGARCH exponential conditional variance with log-likelihood optimization, asymmetry index, and forecast convergence.
  - `src/desk/dccgarch/`: Engle (2002) DCC-GARCH multivariate time-varying conditional correlation matrix, dynamic covariance matrix, and dynamic hedge ratio.
  - `src/desk/bipower/`: Barndorff-Nielsen & Shephard (2004) Realized Bipower Variation (BV), continuous diffusion vs discrete jump separation, and asymptotic Z-statistic jump testing.
- **Testing**: Vitest, zero mocks, analytical closed-form invariants, strictly < 180 LOC per file.

---

## 3. Maritime Engineering Stack (Phases 403-406)
- **Language & Runtime**: Python 3.12+ with standard library and Pydantic v2 validation.
- **Architecture**:
  - `src/core/maritime/boiler_water_chemistry.py`: Coordinated phosphate-pH balance, hydrazine scavenger, TDS blowdown.
  - `src/core/maritime/stern_tube_eal.py`: US EPA VGP 2013 bio-lubricant water ingress, seal differential pressure, viscosity degradation.
  - `src/core/maritime/incinerator_sludge.py`: IMO MEPC.76(40) combustion chamber temperature interlock, sludge viscosity, flue gas limits.
  - `src/core/maritime/sewage_treatment_mbr.py`: IMO MEPC.227(64) membrane bioreactor, BOD5/COD/TSS/coliforms, nitrogen/phosphorus removal.
  - `src/core/maritime/maritime_boiler_tube_incinerator_stp_engine.py`: Unified operational assessment facade.
- **Tooling & Protocol**: FastMCP async tool registration, automated status classification, and safety interlocks.
