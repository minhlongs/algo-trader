# Technology Stack & Standards — Wave 132-134 Quantitative Desks

## Runtime & Engine Stack
- **Language**: TypeScript 5.6+ in Node.js / Cloudflare Workers runtimes.
- **Testing Framework**: Vitest with 100% zero-mock deterministic numerical assertions.
- **Numerics**: Native TypeScript floating-point mathematics:
  - Error function (`erf`) rational approximation for cumulative normal distribution $\mathcal{N}(x)$.
  - Analytical exchange option Greeks and Put-Call parity symmetry.
  - Closed-form exponential and joint transition survival probabilities.
  - Numerical convolution / Riemann integration for transient price impact kernels.

## File LOC Budget (<150 LOC target, strict <200 LOC rule)
- Desk 132 (Margrabe):
  - `src/desk/margrabe/margrabe-types.ts` (~30 LOC)
  - `src/desk/margrabe/margrabe-math.ts` (~110 LOC)
  - `src/desk/margrabe/margrabe-engine.ts` (~90 LOC)
  - `tests/unit/desk/margrabe/margrabe-suite.test.ts` (~90 LOC)
- Desk 133 (Jarrow-Yu):
  - `src/desk/jarrowyu/jarrow-yu-types.ts` (~35 LOC)
  - `src/desk/jarrowyu/jarrow-yu-math.ts` (~110 LOC)
  - `src/desk/jarrowyu/jarrow-yu-engine.ts` (~90 LOC)
  - `tests/unit/desk/jarrowyu/jarrow-yu-suite.test.ts` (~90 LOC)
- Desk 134 (Gatheral):
  - `src/desk/gatheral/gatheral-types.ts` (~35 LOC)
  - `src/desk/gatheral/gatheral-math.ts` (~110 LOC)
  - `src/desk/gatheral/gatheral-engine.ts` (~95 LOC)
  - `tests/unit/desk/gatheral/gatheral-suite.test.ts` (~90 LOC)
