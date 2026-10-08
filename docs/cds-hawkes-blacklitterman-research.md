# Research Report: CDS Basis, Multivariate Hawkes LOB, and Black-Litterman Desks

## 1. Domain Mathematics & Specifications

### A. Credit Default Swap (CDS) Basis Desk (`src/desk/cds/`)
1. **CDS-Bond Basis**:
   - $\text{Basis} = \text{CDS}_{\text{spread}} - \text{ASW}_{\text{spread}}$
   - Where $\text{ASW}_{\text{spread}} = y_{\text{bond}} - y_{\text{swap}}$ (Asset Swap Spread).
   - Negative Basis ($\text{Basis} < 0$): Buying cash corporate bond and buying CDS protection locks in positive net yield with credit risk hedged.
2. **Hazard Rate Bootstrapping**:
   - Survival probability $Q(t) = \exp(-\int_0^t \lambda(s) ds) = \exp(-\lambda \cdot t)$ under piecewise constant hazard rate $\lambda$.
   - CDS Par Spread $S \approx (1 - R) \lambda$, where $R$ is recovery rate (typically 40% for senior unsecured).

### B. High-Frequency Limit Order Book Hawkes Desk (`src/desk/hawkes/`)
1. **Mutually Exciting Hawkes Process**:
   - Event types $m \in \{1, \dots, M\}$ (e.g., Aggressive Buy, Aggressive Sell, Limit Bid, Limit Ask, Cancellation).
   - Intensity: $\lambda_m(t) = \mu_m + \sum_{j=1}^M \sum_{t_k^j < t} \alpha_{mj} e^{-\beta_{mj}(t - t_k^j)}$.
2. **Branching Matrix & Reflexivity**:
   - Kernel norm / Branching ratio $\Gamma_{mj} = \frac{\alpha_{mj}}{\beta_{mj}}$.
   - System stability: Spectral radius $\rho(\mathbf{\Gamma}) < 1$. High $\rho \to 1$ indicates endogenous clustering / flash crash vulnerability.

### C. Black-Litterman Portfolio Allocation Desk (`src/desk/blacklitterman/`)
1. **Market Equilibrium Implied Prior**:
   - $\Pi = \lambda \mathbf{\Sigma} w_{\text{mkt}}$, with risk aversion $\lambda = \frac{r_{\text{mkt}} - r_f}{\sigma_{\text{mkt}}^2}$.
2. **Bayesian Posterior Blending**:
   - Investor views: $\mathbf{P} E[R] = Q + \epsilon$, where $\epsilon \sim \mathcal{N}(0, \mathbf{\Omega})$.
   - Posterior expected returns:
     $$E[R] = \left[(\tau \mathbf{\Sigma})^{-1} + \mathbf{P}^T \mathbf{\Omega}^{-1} \mathbf{P}\right]^{-1} \left[(\tau \mathbf{\Sigma})^{-1} \Pi + \mathbf{P}^T \mathbf{\Omega}^{-1} Q\right]$$
   - Posterior covariance: $\mathbf{M} = \mathbf{\Sigma} + \left[(\tau \mathbf{\Sigma})^{-1} + \mathbf{P}^T \mathbf{\Omega}^{-1} \mathbf{P}\right]^{-1}$.

## 2. Invariants & Code Standards
- 100% deterministic pure TypeScript.
- Strictly $\le 200$ LOC per source file.
- 0 `:any` types; passes `npx tsc --noEmit`.
- 100% real unit test coverage (no mocks or stubs).
