# Credit Default Swap (CDS) Basis, Multivariate Hawkes LOB & Black-Litterman Architecture

## Overview
Institutional quantitative trading desks covering corporate/sovereign credit risk default intensity and cash-funded negative basis arbitrage, high-frequency limit order book self-excitation and reflexivity via multivariate Hawkes processes, and Black-Litterman Bayesian portfolio optimization with subjective investor view blending.

## 1. Credit Default Swap (CDS) Basis Desk (`src/desk/cds/`)
- `cds-types.ts`: CDS par spreads, corporate bond quotes, asset swap spreads, and hazard rate curve definitions.
- `hazard-rate-bootstrapper.ts`: Solves default intensity $\lambda = S / (1 - R)$ from par spreads under standard recovery rates, generating survival probability curves $Q(t) = e^{-\lambda t}$.
- `cds-bond-basis-arbitrage-engine.ts`: Evaluates the CDS-bond basis spread ($\text{Basis} = \text{CDS} - \text{ASW}$), detects negative basis cash-and-carry opportunities, and computes net carry after repo financing haircuts.

## 2. High-Frequency Limit Order Book Hawkes Desk (`src/desk/hawkes/`)
- `hawkes-types.ts`: Point process events, multivariate kernel parameters, intensity decompositions, and branching ratio matrices.
- `multivariate-hawkes-intensity-estimator.ts`: Evaluates time-varying conditional intensities $\lambda_m(t) = \mu_m + \sum \alpha e^{-\beta(t - t_k)}$, decomposing order flow into exogenous and endogenous clustering shares.
- `branching-ratio-stability-analyzer.ts`: Computes branching ratio matrix $\Gamma_{mj} = \alpha_{mj}/\beta_{mj}$, determines spectral radius $\rho(\mathbf{\Gamma})$ using power iteration, and assesses microstructural stability against self-excited cascades.

## 3. Black-Litterman Portfolio Asset Allocation Desk (`src/desk/blacklitterman/`)
- `black-litterman-types.ts`: Market capitalization weights, asset return covariance, pick matrices, view certainty, and posterior allocations.
- `implied-equilibrium-prior-calculator.ts`: Performs reverse optimization to infer implied market equilibrium excess returns $\Pi = \lambda \mathbf{\Sigma} w_{\text{mkt}}$.
- `black-litterman-blender.ts`: Blends market equilibrium priors with investor subjective absolute/relative views using the Master Formula, producing optimal tilts and risk-adjusted portfolio weights.
