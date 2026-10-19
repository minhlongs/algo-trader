# Quantitative Desk Waves 205-207 Brainstorm

## Wave 205: Noise-Robust Spot Volatility (Christensen-Podolskij-Vetter)
*   **Goal**: Suppress market microstructure noise (MMSN) to isolate true spot variance.
*   **Math**: Pre-averaging estimator $ \hat{\sigma}^2_t = \frac{1}{\theta_k \Delta_n} \sum (\bar{y}_{i,k})^2 - \frac{\Psi}{\theta_k} \hat{\eta}^2 $, where $\bar{y}_{i,k}$ is local average over $k$ steps.
*   **Arch**: Sliding kernel window $[h=5min, 15min]$. Rolling variance buffer.
*   **Constraints**: $\theta_k$ scaling parameter. Kernel bandwidth optimization.

## Wave 206: Bayesian Trade Asymmetry (Glosten-Milgrom)
*   **Goal**: Infer informed trader probability ($\alpha$) behind every LOB tick.
*   **Math**: $P(V=H | Trade=Buy) = \frac{\alpha \delta + (1-\alpha) \delta_{Buy}}{\alpha \delta + (1-\alpha) \delta_{Buy} + \alpha (1-\delta) + (1-\alpha) \delta_{Sell}}$.
*   **Arch**: Incremental Bayes posterior updater. LOB update event listener.
*   **Constraints**: $\delta$ (uninformed ratio) calibration. Static $P(V=H)$ prior.

## Wave 207: Tail & JAI (Bollerslev-Todorov)
*   **Goal**: Decompose tail risk into continuous diffusion vs. discontinuous jumps.
*   **Math**: $JAI(t) = \frac{\int_0^t \mathbb{I}_{\Delta X \neq 0} dX}{\sqrt{\int_0^t \sigma^2 dX}}$. Tail index $\beta$ via EVT Pareto MLE.
*   **Arch**: High-frequency jump detector (thresholding). Rolling 99.9% VaR tail-index estimator.
*   **Constraints**: High-frequency tick data only. $\lambda(t)$ arrival rate model.

## Desk Architecture
*   **Modularity**: Each wave as isolated service, TS interfaces strict.
*   **Files**: `< 150 LOC`. `src/quant/waves/w205.ts`, `src/quant/waves/w206.ts`, `src/quant/waves/w207.ts`.
*   **No Mocks**: Rely on local `better-auth` integration for real data access if needed.
*   **Performance**: Use `ArrayBuffer` pools for high-frequency ticks to avoid GC pressure.
