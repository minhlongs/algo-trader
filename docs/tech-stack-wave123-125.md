# Tech Stack & Architecture: Wave 123–125 Quantitative Desks

## 1. Architectural Blueprint
```
src/desk/
├── rubinstein/
│   ├── rubinstein-types.ts      # Implied binomial tree parameters, state prices & options
│   ├── rubinstein-math.ts       # Arrow-Debreu pricing, terminal probabilities, quadratic program solver
│   └── rubinstein-engine.ts     # Engine orchestrating calibration, smile extraction & validation
├── lando/
│   ├── lando-types.ts           # Rating states, generator matrix, transition curves, credit spreads
│   ├── lando-math.ts            # Matrix exponential (scaling & squaring), survival curves, hazard rates
│   └── lando-engine.ts          # Continuous-time Markov engine, migration analytics, input validation
└── obizhaevawang/
    ├── obizhaeva-wang-types.ts  # Resilience parameters, execution schedules, impact cost breakdown
    ├── obizhaeva-wang-math.ts   # Transient impact kernel, optimal block sizing, TWAP cost comparisons
    └── obizhaeva-wang-engine.ts # Execution optimizer, benchmark evaluation, schedule validator
```

## 2. Desk Specifications
| Desk | Core Innovation | Mathematical Driver | Verification Baseline |
|------|-----------------|---------------------|-----------------------|
| **Desk 123 (Rubinstein 1994)** | Non-parametric smile implied binomial tree | Least-squares terminal density calibration + Arrow-Debreu backward induction | Fits market call prices, martingale condition $\sum P_j S_j = F$, $0 \le p_{i, j} \le 1$ |
| **Desk 124 (Lando 1998)** | Continuous-time rating migration & default risk | Matrix exponential $\mathbf{P}(t) = \exp(\mathbf{Q} t)$ via scaling & squaring | Row stochasticity $\sum_j P_{ij} = 1$, monotonic default prob with rating downgrade, positive spreads |
| **Desk 125 (Obizhaeva-Wang 2013)** | Transient impact & exponential resilience | Discrete jumps at $t=0, T$ with constant velocity drift | Total volume conservation $\sum x_k = Q_0$, cost reduction vs naive TWAP |

## 3. Modular Constraints & Standards
- Strictly $\le 200$ LOC per file.
- Zero external runtime dependencies.
- Zero `:any` types in TypeScript (strict mode enabled).
- Zero-mock unit test coverage with Vitest.
