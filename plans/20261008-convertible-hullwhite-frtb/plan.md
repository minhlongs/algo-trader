# Plan: Wave 48-50 Convertible Bond Arb, Hull-White Short Rate & Liquidity FRTB Desks

## Phases
1. **Phase 1: Convertible Bond Arbitrage Desk (`src/desk/convertible/`)**
   - Indenture terms, parity, straight debt floor, Black-Scholes equity call option decomposition.
   - Dynamic equity delta hedge ratio calculation and gamma scalping PnL estimator.
2. **Phase 2: 1-Factor Hull-White Short Rate Desk (`src/desk/shortrate/`)**
   - Affine term structure functions $A(t, T)$ and $B(t, T)$, zero-coupon bond pricing.
   - Jamshidian decomposition for analytical European bond options and swaptions.
3. **Phase 3: Liquidity-Adjusted VaR & Basel FRTB Desk (`src/desk/lvar/`)**
   - Bangia bid-ask spread liquidity risk penalty to standard Value-at-Risk.
   - Basel III / FRTB 97.5% Expected Shortfall engine with EVT heavy-tail scaling.
4. **Phase 4: Unit Testing & Verification**
   - Test suites covering all 3 desks with 100% pass rate.
   - Typecheck and zero lint errors.
